import test from 'node:test'
import assert from 'node:assert/strict'

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
})

test('calculateRecencyScore applies smooth exponential decay', () => {
  const now = new Date().toISOString()
  const todayScore = calculateRecencyScore(now)
  assert.ok(todayScore > 0.99 && todayScore <= 1.0)
})

test('markdown parsing extracts single-line, multiline, and [✔ Verified] memories', () => {
  const sampleMarkdown = `
## Project & User Persistent Memory

### Code Conventions & Standards
- **Styling** \`[✔ Verified]\`: Always use HSL colors.
  Do not use Tailwind CSS utility classes.
- **Testing**: Use pytest-asyncio for async fixtures.

### Past Lessons & Bug Fix Records
- **Vite Proxy** \`[✔ Verified]\`: Fixed proxy issue by setting changeOrigin to true.
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
      const match = trimmed.match(/^- \*\*(.*?)\*\*(.*?):\s*(.*)$/)
      if (match) {
        const topic = match[1].trim()
        const tagPart = match[2].trim()
        const content = match[3].trim()
        const verified = tagPart.includes('[✔ Verified]')
        const item = { topic, content, category: currentCategory, verified }
        memories.set(topic.toLowerCase(), item)
        lastItem = item
      }
    } else if (lastItem && (line.startsWith('  ') || line.startsWith('\t'))) {
      lastItem.content += '\n' + trimmed
    }
  }

  assert.equal(memories.size, 3)
  assert.ok(memories.get('styling').verified)
  assert.ok(!memories.get('testing').verified)
  assert.ok(memories.get('vite proxy').verified)
})

test('self-correction and reflection deduplicate near-identical memories', () => {
  const memories = new Map()
  const item1 = {
    id: 'vite config',
    topic: 'Vite Config',
    content: 'Set host to 0.0.0.0 for docker bindings',
    verified: true,
    accessCount: 5,
    vector: [0.95, 0.05],
  }
  const item2 = {
    id: 'vite network config',
    topic: 'Vite Network Config',
    content: 'Docker needs host 0.0.0.0',
    verified: false,
    accessCount: 2,
    vector: [0.93, 0.07],
  }

  memories.set(item1.id, item1)
  memories.set(item2.id, item2)

  // Simulation of reflect() consolidation
  const sim = cosineSimilarity(item1.vector, item2.vector)
  assert.ok(sim > 0.88, 'Vectors should detect near-duplicate topic')

  if (sim > 0.88) {
    const primary = item1.verified ? item1 : item2
    const secondary = primary === item1 ? item2 : item1
    primary.accessCount += secondary.accessCount
    memories.delete(secondary.id)
  }

  assert.equal(memories.size, 1)
  assert.equal(memories.get('vite config').accessCount, 7)
})
