/**
 * Memory Conflict Detector: Identifies polarity contradictions on the same subject.
 * Ported from Shion core (shion/memory/conflict.py) with full Chinese grammar negation support.
 */

export interface ConflictMatch {
  subjectKey: string
  oldPolarity: 'positive' | 'negative' | 'forbid' | 'require'
  newPolarity: 'positive' | 'negative' | 'forbid' | 'require'
  reason: string
}

const FORBID_VERBS = [
  '禁止使用',
  '不允许使用',
  '不得使用',
  '不要使用',
  '不使用',
  '禁止用',
  '不要用',
  '不用',
  '别用',
  '禁用',
  '禁止',
  '杜绝',
  '避免使用',
]

const REQUIRE_VERBS = [
  '必须使用',
  '必须要用',
  '一律使用',
  '统一使用',
  '允许使用',
  '可以使用',
  '务必使用',
  '必须用',
  '使用',
  '采用',
  '用',
]

export class MemoryConflictDetector {
  /**
   * Detect if a new rule conflicts with an existing rule on the same subject.
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
      reason: `Polarity conflict on subject '${newSem.subjectKey}': ${oldSem.polarity} -> ${newSem.polarity}`,
    }
  }

  public static classify(text: string): { subjectKey: string; polarity: 'forbid' | 'require' | 'positive' | 'negative' } | null {
    if (!text || typeof text !== 'string') return null
    const clean = text.toLowerCase().trim()

    // 1. Tool / Library forbid check (Check longer negative phrases first!)
    for (const verb of FORBID_VERBS) {
      const idx = clean.indexOf(verb)
      if (idx !== -1) {
        const after = clean.slice(idx + verb.length).trim()
        const targetMatch = after.match(/^([a-z0-9_.+\-/]+)/i)
        if (targetMatch) {
          return {
            subjectKey: `tool:${targetMatch[1].toLowerCase()}`,
            polarity: 'forbid',
          }
        }
      }
    }

    // 2. Tool / Library require check
    for (const verb of REQUIRE_VERBS) {
      const idx = clean.indexOf(verb)
      if (idx !== -1) {
        const after = clean.slice(idx + verb.length).trim()
        const targetMatch = after.match(/^([a-z0-9_.+\-/]+)/i)
        if (targetMatch) {
          return {
            subjectKey: `tool:${targetMatch[1].toLowerCase()}`,
            polarity: 'require',
          }
        }
      }
    }

    // 3. Generic like / dislike preferences
    const isNegative = /不喜欢|讨厌|不要|别再|不再/.test(clean)
    const isPositive = /喜欢|偏好|倾向|必须|习惯/.test(clean)

    if (isNegative || isPositive) {
      const subject = clean
        .replace(/(记住[:：]?|以后|默认|从现在开始|每次|长期|我|不喜欢|讨厌|不要|别再|不再|喜欢|偏好|倾向|习惯|用|要|都|会|：|:)+/g, '')
        .trim()
      if (subject.length >= 2) {
        return {
          subjectKey: `pref:${subject.slice(0, 20)}`,
          polarity: isNegative ? 'negative' : 'positive',
        }
      }
    }

    return null
  }
}
