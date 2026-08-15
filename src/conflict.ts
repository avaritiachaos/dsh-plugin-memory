/**
 * Memory Conflict Detector: Identifies polarity contradictions on the same subject.
 * Ported from Shion core (shion/memory/conflict.py).
 */

export interface ConflictMatch {
  subjectKey: string
  oldPolarity: 'positive' | 'negative' | 'forbid' | 'require'
  newPolarity: 'positive' | 'negative' | 'forbid' | 'require'
  reason: string
}

export class MemoryConflictDetector {
  /**
   * Detect if a new rule conflicts with an existing rule.
   */
  public static detectConflict(newContent: string, existingContent: string): ConflictMatch | null {
    const newSem = this.classify(newContent)
    const oldSem = this.classify(existingContent)

    if (!newSem || !oldSem) return null
    if (newSem.subjectKey !== oldSem.subjectKey) return null
    if (newSem.polarity === oldSem.polarity) return null

    return {
      subjectKey: newSem.subjectKey,
      oldPolarity: oldSem.polarity,
      newPolarity: newSem.polarity,
      reason: `Conflict on subject '${newSem.subjectKey}': ${oldSem.polarity} -> ${newSem.polarity}`,
    }
  }

  private static classify(text: string): { subjectKey: string; polarity: 'forbid' | 'require' | 'positive' | 'negative' } | null {
    const clean = text.toLowerCase()

    // 1. Tool / Library forbid vs require (e.g. "不要用 Tailwind" vs "使用 Tailwind")
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

    // 2. Generic like / dislike preferences
    const isNegative = /不喜欢|讨厌|不要|别/.test(clean)
    const isPositive = /喜欢|偏好|倾向|要/.test(clean)

    if (isNegative || isPositive) {
      const subject = clean.replace(/(记住|以后|默认|我|喜欢|不喜欢|讨厌|不要|用|要|都|会|：|:)+/g, '').trim()
      if (subject.length >= 2) {
        return {
          subjectKey: `pref:${subject.slice(0, 15)}`,
          polarity: isNegative ? 'negative' : 'positive',
        }
      }
    }

    return null
  }
}
