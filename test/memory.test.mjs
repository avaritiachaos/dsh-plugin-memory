import test from 'node:test'
import assert from 'node:assert'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { Context } from 'cordis'
import { MemoryGuard, MemoryConflictDetector, MemoryService } from '../dist/index.js'

async function makeService(t, config = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const svc = new MemoryService(new Context(), {
    storagePath: path.join(dir, 'MEMORY.md'),
    vectorStoragePath: path.join(dir, 'store.json'),
    ...config,
  })
  await svc.start()
  return svc
}

// ── guard / conflict / decay (unchanged behavior) ──────────────────────────

test('MemoryGuard blocks stack traces, diffs, API keys, and full file dumps', () => {
  const tb = MemoryGuard.isRedLight('Traceback (most recent call last):\n  File "a.py", line 1, in <module>\nZeroDivisionError')
  assert.strictEqual(tb.blocked, true)

  const diff = MemoryGuard.isRedLight('```diff\n- old_code()\n+ new_code()\n```')
  assert.strictEqual(diff.blocked, true)

  const key = MemoryGuard.isRedLight('My API key is sk-1234567890abcdef1234567890abcdef12345678')
  assert.strictEqual(key.blocked, true)

  const normal = MemoryGuard.isRedLight('Always use 2-space indentation and functional components.')
  assert.strictEqual(normal.blocked, false)
})

test('MemoryConflictDetector correctly handles complex Chinese negative grammar', () => {
  const c1 = MemoryConflictDetector.detectConflict(
    '从现在开始，项目中禁止使用 TailwindCSS',
    '以后统一使用 TailwindCSS 进行样式开发'
  )
  assert.notStrictEqual(c1, null)
  assert.strictEqual(c1.subjectKey, 'tool:tailwindcss')
  assert.strictEqual(c1.newPolarity, 'forbid')
  assert.strictEqual(c1.oldPolarity, 'require')

  const c2 = MemoryConflictDetector.detectConflict('不要使用 axios，采用原生 fetch', '网络请求采用 axios')
  assert.notStrictEqual(c2, null)
  assert.strictEqual(c2.subjectKey, 'tool:axios')

  const c3 = MemoryConflictDetector.detectConflict('记住我以后不喜欢用类组件', '记住我习惯用类组件')
  assert.notStrictEqual(c3, null)
  assert.strictEqual(c3.newPolarity, 'negative')
  assert.strictEqual(c3.oldPolarity, 'positive')
})

test('Half-life decay math gives exactly 0.5 at 30 days and handles invalid dates', () => {
  const calcDecay = (days) => Math.pow(0.5, days / 30)
  assert.strictEqual(calcDecay(0), 1.0)
  assert.strictEqual(calcDecay(30), 0.5)
  assert.strictEqual(calcDecay(60), 0.25)

  const parseSafe = (d) => {
    if (!d) return 0.5
    const ms = new Date(d).getTime()
    return Number.isFinite(ms) ? Math.pow(0.5, Math.max(0, Date.now() - ms) / (1000 * 60 * 60 * 24 * 30)) : 0.5
  }
  assert.strictEqual(parseSafe('invalid-date-string'), 0.5)
  assert.strictEqual(parseSafe(null), 0.5)
})

// ── lifecycle & persistence ─────────────────────────────────────────────────

test('MemoryService persists to disk and reloads across instances', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const cfg = { storagePath: path.join(dir, 'MEMORY.md'), vectorStoragePath: path.join(dir, 'store.json') }

  const a = new MemoryService(new Context(), cfg)
  await a.start()
  await a.remember('架构决策', '使用 pnpm workspace 管理 monorepo', { category: 'architecture', importance: 4 })

  const b = new MemoryService(new Context(), cfg)
  await b.start()
  const recalled = await b.recall('pnpm')
  assert.strictEqual(recalled.length, 1)
  assert.strictEqual(recalled[0].topic, '架构决策')
  assert.strictEqual(recalled[0].content, '使用 pnpm workspace 管理 monorepo')
})

test('MemoryService serializes concurrent mutations without lost updates (transaction lock)', async (t) => {
  const svc = await makeService(t)
  const results = await Promise.all([
    svc.remember('工具A', '必须使用 X'),
    svc.remember('工具B', '禁止使用 X'), // conflicts with 工具A; only one survives
    svc.remember('工具C', '使用 Y'),
  ])
  for (const r of results) assert.strictEqual(r.success, true)
  const all = await svc.recall()
  // 工具A and 工具B conflict (use vs forbid X) -> exactly one of them remains,
  // and both writes were serialized (no interleaved corruption).
  assert.strictEqual(all.length, 2)
  const topics = new Set(all.map((i) => i.topic))
  assert.ok(topics.has('工具C'))
  assert.strictEqual(topics.has('工具A') === topics.has('工具B'), false)
})

// ── verified protection ─────────────────────────────────────────────────────

test('MemoryService protects verified rules from unverified overwrites', async (t) => {
  const svc = await makeService(t)

  const first = await svc.remember('规则', '使用 Tailwind', { verified: true, verificationProof: 'ci#123' })
  assert.strictEqual(first.success, true)

  // same topic, unverified -> rejected
  const same = await svc.remember('规则', '禁止使用 Tailwind')
  assert.strictEqual(same.success, false)
  assert.match(same.message, /verified rule/)

  // conflicting topic, unverified -> rejected
  const conflict = await svc.remember('样式', '禁止使用 Tailwind')
  assert.strictEqual(conflict.success, false)
  assert.match(conflict.message, /verified rule/)

  // explicit forceOverride -> allowed
  const forced = await svc.remember('规则', '禁止使用 Tailwind', { forceOverride: true })
  assert.strictEqual(forced.success, true)

  // correct() marks verified; unverified remember afterwards is rejected again
  const corrected = await svc.correct('规则', '最终决定：使用 Tailwind')
  assert.strictEqual(corrected.success, true)
  const afterCorrect = await svc.remember('规则', '换个说法')
  assert.strictEqual(afterCorrect.success, false)
})

test('MemoryService stores verificationProof and serializes it', async (t) => {
  const svc = await makeService(t)
  await svc.remember('测试规则', '每个 PR 必须通过 CI', { verified: true, verificationProof: 'ci#123' })
  const items = await svc.recall('CI')
  assert.strictEqual(items[0].verified, true)
  assert.strictEqual(items[0].verificationProof, 'ci#123')
  assert.match(svc.serializeForDisk(), /proof: ci#123/)
})

// ── error rollback & metadata validation ────────────────────────────────────

test('MemoryService rolls back in-memory state when persistence fails', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  // blocker is a FILE, so MEMORY.md's parent dir can never be created
  const blocker = path.join(dir, 'blocker')
  await fs.writeFile(blocker, 'i am a file', 'utf-8')

  const svc = new MemoryService(new Context(), {
    storagePath: path.join(blocker, 'MEMORY.md'),
    vectorStoragePath: path.join(dir, 'store.json'),
  })
  await svc.start()
  const res = await svc.remember('会失败', '这条不会成功')
  assert.strictEqual(res.success, false)
  assert.match(res.message, /Failed to persist/)

  // state was rolled back: nothing was remembered
  assert.deepStrictEqual(await svc.recall(), [])
})

test('MemoryService validates metadata on load (importance/vector/date ranges)', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const store = path.join(dir, 'store.json')
  const md = path.join(dir, 'MEMORY.md')

  const seed = new MemoryService(new Context(), { storagePath: md, vectorStoragePath: store })
  await seed.start()
  await seed.remember('元数据', '正常内容')
  // corrupt the metadata cache on disk
  await fs.writeFile(
    store,
    JSON.stringify({
      元数据: { importance: 99, vector: ['not-a-number'], accessCount: -5, lastAccessedAt: 'garbage-date', category: 'not-a-category' },
    }),
    'utf-8',
  )

  const svc = new MemoryService(new Context(), { storagePath: md, vectorStoragePath: store })
  await svc.start()
  const items = await svc.recall('元数据')
  assert.strictEqual(items.length, 1)
  assert.strictEqual(items[0].importance, 5) // clamped into [1,5], not 99
  assert.strictEqual(items[0].vector, undefined) // invalid vector rejected
  assert.strictEqual(items[0].accessCount, 2) // 1 from load (negative -5 rejected) + 1 recall bump
  assert.strictEqual(items[0].category, 'general')
})

test('MemoryService autoRecall=false makes recall read-only', async (t) => {
  const svc = await makeService(t, { autoRecall: false })
  await svc.remember('只读', '内容')
  await svc.recall('只读')
  await svc.recall('只读')
  const items = await svc.recall('只读')
  assert.strictEqual(items[0].accessCount, 1) // never bumped in read-only mode
})
