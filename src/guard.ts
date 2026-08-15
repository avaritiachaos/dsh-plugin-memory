/**
 * Memory Guard: Red-light filter preventing garbage, stack traces, diffs, and secrets from polluting memory.
 * Ported from Shion core (shion/memory/guard.py).
 */

const RED_LIGHT_PATTERNS: RegExp[] = [
  /Traceback \(most recent call last\)|stack trace|File ".*?\.py", line \d+/i,
  /\bpytest\b|\bPASSED\b|\bFAILED\b|\bERROR\b/i,
  /```diff|^diff --git |^\+\+\+ |^--- |^@@ /m,
  /\bsk-[A-Za-z0-9_-]{16,}|(?:api[_-]?key|token|secret|password)\s*[:=]\s*[A-Za-z0-9_./+=-]{8,}/i,
  /\b[A-Za-z0-9_./+=-]{48,}\b/, // Long raw token hashes
]

export class MemoryGuard {
  /**
   * Check if a memory content violates red-light safety rules.
   */
  public static isRedLight(text: string): { blocked: boolean; reason?: string } {
    if (!text || !text.trim()) {
      return { blocked: true, reason: 'empty_content' }
    }

    if (text.length > 500 && (text.includes('def ') || text.includes('class ') || text.includes('import '))) {
      return { blocked: true, reason: 'file_fulltext_detected' }
    }

    for (const pattern of RED_LIGHT_PATTERNS) {
      if (pattern.test(text)) {
        return { blocked: true, reason: `red_light_pattern_matched: ${pattern}` }
      }
    }

    return { blocked: false }
  }
}
