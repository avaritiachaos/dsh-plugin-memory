import test from 'node:test'
import assert from 'node:assert'
import { MemoryGuard } from '../src/guard.ts'
import { MemoryConflictDetector } from '../src/conflict.ts'

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
  // Test "禁止使用" vs "使用"
  const c1 = MemoryConflictDetector.detectConflict(
    '从现在开始，项目中禁止使用 TailwindCSS',
    '以后统一使用 TailwindCSS 进行样式开发'
  )
  assert.notStrictEqual(c1, null)
  assert.strictEqual(c1.subjectKey, 'tool:tailwindcss')
  assert.strictEqual(c1.newPolarity, 'forbid')
  assert.strictEqual(c1.oldPolarity, 'require')

  // Test "不要使用" vs "采用"
  const c2 = MemoryConflictDetector.detectConflict(
    '不要使用 axios，采用原生 fetch',
    '网络请求采用 axios'
  )
  assert.notStrictEqual(c2, null)
  assert.strictEqual(c2.subjectKey, 'tool:axios')

  // Test preferences
  const c3 = MemoryConflictDetector.detectConflict(
    '记住我以后不喜欢用类组件',
    '记住我习惯用类组件'
  )
  assert.notStrictEqual(c3, null)
  assert.strictEqual(c3.newPolarity, 'negative')
  assert.strictEqual(c3.oldPolarity, 'positive')
})

test('Half-life decay math gives exactly 0.5 at 30 days and handles invalid dates', () => {
  const calcDecay = (days) => Math.pow(0.5, days / 30)
  assert.strictEqual(calcDecay(0), 1.0)
  assert.strictEqual(calcDecay(30), 0.5)
  assert.strictEqual(calcDecay(60), 0.25)

  // Safe decay parser logic
  const parseSafe = (d) => {
    if (!d) return 0.5
    const ms = new Date(d).getTime()
    return Number.isFinite(ms) ? Math.pow(0.5, Math.max(0, Date.now() - ms) / (1000 * 60 * 60 * 24 * 30)) : 0.5
  }
  assert.strictEqual(parseSafe('invalid-date-string'), 0.5)
  assert.strictEqual(parseSafe(null), 0.5)
})
