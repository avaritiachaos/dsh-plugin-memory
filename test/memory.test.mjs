import test from 'node:test'
import assert from 'node:assert/strict'

// Ported MemoryGuard
class MemoryGuard {
  static isRedLight(text) {
    if (!text || !text.trim()) return { blocked: true, reason: 'empty_content' }
    const patterns = [
      /Traceback \(most recent call last\)|stack trace|File ".*?\.py", line \d+/i,
      /\bpytest\b|\bPASSED\b|\bFAILED\b|\bERROR\b/i,
      /```diff|^diff --git |^\+\+\+ |^--- |^@@ /m,
      /\bsk-[A-Za-z0-9_-]{16,}/i,
    ]
    for (const pattern of patterns) {
      if (pattern.test(text)) return { blocked: true, reason: 'red_light_matched' }
    }
    return { blocked: false }
  }
}

// Ported MemoryConflictDetector
class MemoryConflictDetector {
  static detectConflict(newContent, existingContent) {
    const newSem = this.classify(newContent)
    const oldSem = this.classify(existingContent)
    if (!newSem || !oldSem) return null
    if (newSem.subjectKey !== oldSem.subjectKey) return null
    if (newSem.polarity === oldSem.polarity) return null
    return {
      subjectKey: newSem.subjectKey,
      oldPolarity: oldSem.polarity,
      newPolarity: newSem.polarity,
    }
  }

  static classify(text) {
    const clean = text.toLowerCase()
    const matchTool = clean.match(/(不要用|不用|别用|禁用|使用|用)\s*([a-z0-9_.+\-/]+)/i)
    if (matchTool) {
      const verb = matchTool[1]
      const target = matchTool[2]
      const isForbid = ['不要用', '不用', '别用', '禁用'].includes(verb)
      return {
        subjectKey: `tool:${target}`,
        polarity: isForbid ? 'forbid' : 'require',
      }
    }
    return null
  }
}

test('MemoryGuard blocks garbage stack traces and API keys', () => {
  const stackTrace = `Traceback (most recent call last):\n  File "main.py", line 42, in <module>\nValueError: invalid literal`
  assert.ok(MemoryGuard.isRedLight(stackTrace).blocked)

  const secret = `sk-abcdef1234567890abcdef1234567890`
  assert.ok(MemoryGuard.isRedLight(secret).blocked)

  const legitimateRule = `In this project, always use HSL colors instead of hex.`
  assert.ok(!MemoryGuard.isRedLight(legitimateRule).blocked)
})

test('MemoryConflictDetector detects and resolves polarity flip (forbid vs require)', () => {
  const oldRule = `项目前端一律不要用 Tailwind`
  const newRule = `从现在开始，项目中可以使用 Tailwind`

  const conflict = MemoryConflictDetector.detectConflict(newRule, oldRule)
  assert.ok(conflict)
  assert.equal(conflict.subjectKey, 'tool:tailwind')
  assert.equal(conflict.oldPolarity, 'forbid')
  assert.equal(conflict.newPolarity, 'require')
})
