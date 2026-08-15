import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

// Test helper for pure logic extraction
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

function calculateRecencyScore(dateString) {
  try {
    const elapsedMs = Date.now() - new Date(dateString).getTime()
    const days = Math.max(0, elapsedMs / (1000 * 60 * 60 * 24))
    return Math.exp(-days / 30)
  } catch {
    return 0.5
  }
}

test('cosineSimilarity calculates exact vector angles', () => {
  const vecA = [1, 0, 0]
  const vecB = [1, 0, 0]
  assert.equal(cosineSimilarity(vecA, vecB), 1.0)

  const orthogonal = [0, 1, 0]
  assert.equal(cosineSimilarity(vecA, orthogonal), 0)

  const opposite = [-1, 0, 0]
  assert.equal(cosineSimilarity(vecA, opposite), -1.0)

  // Empty / mismatched guard
  assert.equal(cosineSimilarity([], []), 0)
  assert.equal(cosineSimilarity([1, 2], [1]), 0)
})

test('calculateRecencyScore applies smooth exponential decay', () => {
  const now = new Date().toISOString()
  const todayScore = calculateRecencyScore(now)
  assert.ok(todayScore > 0.99 && todayScore <= 1.0)

  // 30 days ago -> should be approximately 1/e ~ 0.367
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const score30 = calculateRecencyScore(thirtyDaysAgo)
  assert.ok(Math.abs(score30 - Math.exp(-1)) < 0.05)
})

test('markdown parsing extracts single-line and multiline memories', () => {
  const sampleMarkdown = `
## Project & User Persistent Memory

### Code Conventions & Standards
- **Styling**: Always use HSL colors.
  Do not use Tailwind CSS utility classes.
- **Testing**: Use pytest-asyncio for async fixtures.

### Past Lessons & Bug Fix Records
- **Vite Proxy**: Fixed proxy issue by setting changeOrigin to true.
`
  const lines = sampleMarkdown.split('\n')
  const memories = new Map()
  let currentCategory = 'general'
  let lastItem = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed.includes('Code Conventions')) {
      currentCategory = 'convention'
      lastItem = null
    } else if (trimmed.includes('Past Lessons')) {
      currentCategory = 'lesson'
      lastItem = null
    } else if (trimmed.startsWith('- **')) {
      const match = trimmed.match(/^- \*\*(.*?)\*\*:\s*(.*)$/)
      if (match) {
        const topic = match[1].trim()
        const content = match[2].trim()
        const item = { topic, content, category: currentCategory }
        memories.set(topic.toLowerCase(), item)
        lastItem = item
      }
    } else if (lastItem && (line.startsWith('  ') || line.startsWith('\t'))) {
      lastItem.content += '\n' + trimmed
    }
  }

  assert.equal(memories.size, 3)
  assert.ok(memories.has('styling'))
  assert.ok(memories.get('styling').content.includes('Do not use Tailwind'))
  assert.equal(memories.get('testing').category, 'convention')
  assert.equal(memories.get('vite proxy').category, 'lesson')
})

test('hybrid score ranks exact keyword and vitality accurately', () => {
  const item1 = {
    topic: 'Vite Config',
    content: 'Set host to 0.0.0.0 for docker bindings',
    category: 'lesson',
    importance: 4,
    accessCount: 10,
    lastAccessedAt: new Date().toISOString(),
    vector: [0.9, 0.1],
  }
  const item2 = {
    topic: 'Unrelated Rule',
    content: 'Do not eat snacks in server room',
    category: 'general',
    importance: 1,
    accessCount: 0,
    lastAccessedAt: new Date(Date.now() - 100 * 24 * 3600 * 1000).toISOString(),
    vector: [0.1, 0.9],
  }

  const query = 'Vite'
  const queryVec = [0.9, 0.1]

  const score1 =
    cosineSimilarity(queryVec, item1.vector) * 0.5 +
    (item1.topic.toLowerCase().includes(query.toLowerCase()) ? 0.6 : 0) * 0.3 +
    calculateRecencyScore(item1.lastAccessedAt) * 0.1 +
    0.05 + 0.04

  const score2 =
    cosineSimilarity(queryVec, item2.vector) * 0.5 +
    (item2.topic.toLowerCase().includes(query.toLowerCase()) ? 0.6 : 0) * 0.3 +
    calculateRecencyScore(item2.lastAccessedAt) * 0.1 +
    0 + 0.01

  assert.ok(score1 > score2 * 2, 'Relevant item must score significantly higher than unrelated item')
})
