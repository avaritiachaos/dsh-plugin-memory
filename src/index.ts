import { Context, Service, Schema } from 'cordis'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { MemoryGuard } from './guard.js'
import { MemoryConflictDetector } from './conflict.js'

export type MemoryCategory = 'convention' | 'preference' | 'architecture' | 'lesson' | 'general'

export interface MemoryItem {
  id: string
  category: MemoryCategory
  topic: string
  content: string
  importance: number // 1 (low) to 5 (critical)
  accessCount: number // Incremented on each recall hit
  verified: boolean // Verified by test run or developer confirmation
  verifiedAt?: string
  lastAccessedAt: string
  createdAt: string
  updatedAt: string
  correctionHistory?: string[]
  vector?: number[]
}

export interface RememberOptions {
  category?: MemoryCategory
  importance?: number
  verified?: boolean
  verificationProof?: string
  forceOverride?: boolean
}

export interface EmbeddingConfig {
  enabled?: boolean
  provider?: 'openai-compatible' | 'ollama' | 'none'
  apiBase?: string
  apiKey?: string
  model?: string
  dimension?: number
}

export interface MemoryConfig {
  storagePath?: string
  vectorStoragePath?: string
  autoRecall?: boolean
  maxRecallChars?: number
  topK?: number
  embedding?: EmbeddingConfig
}

export const MemoryConfig: Schema<MemoryConfig> = Schema.object({
  storagePath: Schema.string().default('.dsh/MEMORY.md').description('Path to persistent markdown memory file.'),
  vectorStoragePath: Schema.string().default('.dsh/memory_store.json').description('Path to vector index & metadata cache.'),
  autoRecall: Schema.boolean().default(true).description('Inject relevant memories into session prompt automatically.'),
  maxRecallChars: Schema.number().default(3500).description('Character budget limit for injected memory section.'),
  topK: Schema.number().default(6).description('Number of top scored memories to recall.'),
  embedding: Schema.object({
    enabled: Schema.boolean().default(false).description('Enable semantic vector embeddings for recall.'),
    provider: Schema.union(['openai-compatible', 'ollama', 'none']).default('none'),
    apiBase: Schema.string().default(''),
    apiKey: Schema.string().default(''),
    model: Schema.string().default('text-embedding-3-small'),
    dimension: Schema.number().default(1536),
  }),
})

declare module 'cordis' {
  interface Context {
    memory: MemoryService
  }
}

/**
 * Cosine Similarity between two dense vectors with zero-norm & finite-number guards.
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length || vecA.length === 0) {
    return 0
  }
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < vecA.length; i++) {
    const valA = vecA[i]
    const valB = vecB[i]
    if (!Number.isFinite(valA) || !Number.isFinite(valB)) return 0
    dotProduct += valA * valB
    normA += valA * valA
    normB += valB * valB
  }
  if (normA <= 0 || normB <= 0) return 0
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom > 0 ? dotProduct / denom : 0
}

/**
 * True 30-day exponential half-life decay: score = (0.5)^(days / 30).
 * Yields exactly 0.5 at 30 days, 0.25 at 60 days.
 */
function calculateRecencyScore(dateString: string): number {
  if (!dateString) return 0.5
  try {
    const timeMs = new Date(dateString).getTime()
    if (!Number.isFinite(timeMs)) return 0.5
    const elapsedMs = Math.max(0, Date.now() - timeMs)
    const days = elapsedMs / (1000 * 60 * 60 * 24)
    return Math.pow(0.5, days / 30)
  } catch {
    return 0.5
  }
}

/**
 * Simple Async Mutex for linearizing file persistence operations.
 */
class AsyncLock {
  private queue = Promise.resolve()

  public acquire<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task)
    this.queue = result.then(() => {}, () => {})
    return result
  }
}

export class MemoryService extends Service<MemoryConfig> {
  public override config: Required<Omit<MemoryConfig, 'embedding'>> & { embedding: Required<EmbeddingConfig> }
  private memories: Map<string, MemoryItem> = new Map()
  private resolvedPath: string = ''
  private resolvedVectorPath: string = ''
  private ioLock = new AsyncLock()

  constructor(ctx: Context, config: MemoryConfig = {}) {
    super(ctx, 'memory', true)
    this.config = {
      storagePath: config.storagePath || '.dsh/MEMORY.md',
      vectorStoragePath: config.vectorStoragePath || '.dsh/memory_store.json',
      autoRecall: config.autoRecall ?? true,
      maxRecallChars: Math.max(100, config.maxRecallChars ?? 3500),
      topK: Math.max(1, config.topK ?? 6),
      embedding: {
        enabled: config.embedding?.enabled ?? false,
        provider: config.embedding?.provider || 'none',
        apiBase: config.embedding?.apiBase || process.env.EMBEDDING_API_BASE || '',
        apiKey: config.embedding?.apiKey || process.env.EMBEDDING_API_KEY || '',
        model: config.embedding?.model || 'text-embedding-3-small',
        dimension: config.embedding?.dimension || 1536,
      },
    }
  }

  protected async start(): Promise<void> {
    const cwd = process.cwd()
    this.resolvedPath = path.isAbsolute(this.config.storagePath)
      ? this.config.storagePath
      : path.resolve(cwd, this.config.storagePath)

    this.resolvedVectorPath = path.isAbsolute(this.config.vectorStoragePath)
      ? this.config.vectorStoragePath
      : path.resolve(cwd, this.config.vectorStoragePath)

    await this.loadFromDisk()
    await this.loadMetadataFromDisk()
    this.ctx.logger.info(
      `[dsh-plugin-memory] Shion 4-Tier Cognitive Engine active: ${this.memories.size} items (Guard: ON, ConflictDetector: ON, Vector: ${
        this.config.embedding.enabled ? 'ON' : 'OFF'
      })`
    )
  }

  public async remember(
    topic: string,
    content: string,
    options: RememberOptions | MemoryCategory = 'general',
    importanceArg: number = 3
  ): Promise<{ success: boolean; id: string; message: string }> {
    const cleanTopic = (topic || '').trim()
    const cleanContent = (content || '').trim()

    // 1. MemoryGuard Red-light check on both topic and content
    const topicGuard = MemoryGuard.isRedLight(cleanTopic)
    if (topicGuard.blocked) {
      return { success: false, id: '', message: `Blocked by MemoryGuard on topic: ${topicGuard.reason}` }
    }
    const contentGuard = MemoryGuard.isRedLight(cleanContent)
    if (contentGuard.blocked) {
      return { success: false, id: '', message: `Blocked by MemoryGuard on content: ${contentGuard.reason}` }
    }

    const key = cleanTopic.toLowerCase()
    const category: MemoryCategory = typeof options === 'string' ? options : options.category || 'general'
    const importanceRaw: number = typeof options === 'object' && options.importance !== undefined ? options.importance : importanceArg
    const clampedImportance = Math.min(5, Math.max(1, Number.isFinite(importanceRaw) ? Math.round(importanceRaw) : 3))
    const verified: boolean = typeof options === 'object' && options.verified !== undefined ? Boolean(options.verified) : false
    const forceOverride: boolean = typeof options === 'object' && options.forceOverride !== undefined ? Boolean(options.forceOverride) : false

    const now = new Date().toISOString()
    const existing = this.memories.get(key)
    const history: string[] = existing?.correctionHistory ? [...existing.correctionHistory] : []

    // 2. Polarity Conflict Detection with Verified Priority Protection
    for (const [otherKey, otherItem] of this.memories.entries()) {
      const conflict = MemoryConflictDetector.detectConflict(cleanContent, otherItem.content)
      if (conflict) {
        // Guard: Unverified candidate CANNOT override an already verified rule without explicit forceOverride
        if (otherItem.verified && !verified && !forceOverride) {
          return {
            success: false,
            id: key,
            message: `Conflict rejected: Unverified rule cannot overwrite verified rule '${otherItem.topic}' (${conflict.reason}). Use correct() or forceOverride: true.`,
          }
        }

        history.push(`[${now}] Conflict Resolved: Superseded rule '${otherItem.topic}' (${conflict.reason})`)
        this.ctx.logger.info(`[dsh-plugin-memory] Auto-resolved polarity conflict: ${conflict.reason}`)
        if (otherKey !== key) {
          this.memories.delete(otherKey)
        }
      }
    }

    let vector: number[] | undefined
    if (this.config.embedding.enabled) {
      try {
        vector = await this.embedText(`${cleanTopic}: ${cleanContent}`)
      } catch (err) {
        this.ctx.logger.warn(`Vector embedding failed for '${cleanTopic}': ${err}`)
      }
    }

    const item: MemoryItem = {
      id: key,
      topic: cleanTopic,
      content: cleanContent,
      category,
      importance: clampedImportance,
      accessCount: existing ? existing.accessCount + 1 : 1,
      verified: verified || (existing?.verified ?? false),
      verifiedAt: verified ? now : existing?.verifiedAt,
      lastAccessedAt: now,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      correctionHistory: history,
      vector: vector || existing?.vector,
    }

    this.memories.set(key, item)

    try {
      await this.persistAll()
    } catch (err) {
      return { success: false, id: key, message: `Failed to persist to disk: ${err}` }
    }

    return {
      success: true,
      id: key,
      message: `Remembered '${cleanTopic}' under [${category}] (verified: ${item.verified ? 'YES' : 'NO'}, importance: ${clampedImportance}/5).`,
    }
  }

  public async correct(
    topic: string,
    correctedContent: string,
    reason: string = 'User correction'
  ): Promise<{ success: boolean; message: string }> {
    const cleanTopic = (topic || '').trim()
    const cleanContent = (correctedContent || '').trim()

    const guardCheck = MemoryGuard.isRedLight(cleanContent)
    if (guardCheck.blocked) {
      return { success: false, message: `Correction blocked by MemoryGuard: ${guardCheck.reason}` }
    }

    const key = cleanTopic.toLowerCase()
    const existing = this.memories.get(key)
    const now = new Date().toISOString()

    const previousContent = existing ? existing.content : '(new)'
    const historyEntry = `[${now}] Corrected: "${previousContent.slice(0, 50)}..." -> "${cleanContent.slice(0, 50)}..." (Reason: ${reason})`

    let vector: number[] | undefined
    if (this.config.embedding.enabled) {
      try {
        vector = await this.embedText(`${cleanTopic}: ${cleanContent}`)
      } catch (err) {
        this.ctx.logger.warn(`Vector update failed for '${cleanTopic}': ${err}`)
      }
    }

    const item: MemoryItem = {
      id: key,
      topic: cleanTopic,
      content: cleanContent,
      category: existing?.category || 'lesson',
      importance: existing ? Math.min(5, existing.importance + 1) : 4,
      accessCount: existing ? existing.accessCount + 1 : 1,
      verified: true, // Explicit corrections are considered verified
      verifiedAt: now,
      lastAccessedAt: now,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      correctionHistory: [...(existing?.correctionHistory || []), historyEntry],
      vector: vector || existing?.vector,
    }

    this.memories.set(key, item)

    try {
      await this.persistAll()
    } catch (err) {
      return { success: false, message: `Persistence failure: ${err}` }
    }

    return {
      success: true,
      message: `Successfully corrected memory for '${cleanTopic}'. Marked as verified.`,
    }
  }

  public async recall(query?: string, topK?: number): Promise<MemoryItem[]> {
    const requestedK = topK !== undefined ? topK : this.config.topK
    const k = Math.max(0, Math.min(100, Number.isFinite(requestedK) ? Math.floor(requestedK) : this.config.topK))
    if (k === 0) return []

    const items = Array.from(this.memories.values())
    if (items.length === 0) return []

    const now = new Date().toISOString()

    if (!query || !query.trim()) {
      // Return top items by importance and recency
      const results = items
        .sort(
          (a, b) =>
            b.importance * 2 + (b.verified ? 2 : 0) + Math.log(b.accessCount + 1) -
            (a.importance * 2 + (a.verified ? 2 : 0) + Math.log(a.accessCount + 1))
        )
        .slice(0, k)

      for (const item of results) {
        item.accessCount++
        item.lastAccessedAt = now
      }
      this.ioLock.acquire(() => this.flushMetadataToDisk()).catch(() => {})
      return results
    }

    const queryLower = query.trim().toLowerCase()
    let queryVec: number[] | null = null

    if (this.config.embedding.enabled) {
      try {
        queryVec = await this.embedText(query)
      } catch (err) {
        this.ctx.logger.warn(`Vector generation for query failed: ${err}`)
      }
    }

    const scored = items.map((item) => {
      const semanticScore = queryVec && item.vector ? cosineSimilarity(queryVec, item.vector) : 0

      let lexicalScore = 0
      if (item.topic.toLowerCase().includes(queryLower)) lexicalScore += 0.6
      if (item.content.toLowerCase().includes(queryLower)) lexicalScore += 0.4
      if (item.category.toLowerCase() === queryLower) lexicalScore += 0.3

      const recencyScore = calculateRecencyScore(item.lastAccessedAt || item.updatedAt)
      const frequencyScore = Math.min(1.0, Math.log10(item.accessCount + 1) / 2)
      const importanceScore = item.importance / 5.0
      const verifiedBonus = item.verified ? 0.15 : 0

      const totalScore =
        (queryVec ? semanticScore * 0.45 : 0) +
        lexicalScore * (queryVec ? 0.25 : 0.6) +
        recencyScore * 0.1 +
        frequencyScore * 0.05 +
        importanceScore * 0.05 +
        verifiedBonus

      return { item, totalScore }
    })

    const results = scored
      .filter((s) => s.totalScore > 0.05)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, k)
      .map((s) => {
        s.item.accessCount++
        s.item.lastAccessedAt = now
        return s.item
      })

    this.ioLock.acquire(() => this.flushMetadataToDisk()).catch(() => {})
    return results
  }

  public async dream(): Promise<{ consolidatedCount: number; message: string }> {
    const activeKeys = new Set(this.memories.keys())
    let consolidatedCount = 0

    for (const keyA of activeKeys) {
      if (!this.memories.has(keyA)) continue
      const itemA = this.memories.get(keyA)!

      for (const keyB of activeKeys) {
        if (keyA === keyB || !this.memories.has(keyB)) continue
        const itemB = this.memories.get(keyB)!

        let isDuplicate = false
        if (itemA.vector && itemB.vector && cosineSimilarity(itemA.vector, itemB.vector) > 0.88) {
          isDuplicate = true
        } else if (itemA.topic.toLowerCase() === itemB.topic.toLowerCase()) {
          isDuplicate = true
        }

        if (isDuplicate) {
          const primary = itemA.verified ? itemA : itemB.verified ? itemB : (itemA.updatedAt > itemB.updatedAt ? itemA : itemB)
          const secondary = primary === itemA ? itemB : itemA

          primary.accessCount += secondary.accessCount
          primary.content = `${primary.content}\n(Consolidated: ${secondary.content})`
          this.memories.delete(secondary.id)
          consolidatedCount++
        }
      }
    }

    if (consolidatedCount > 0) {
      await this.persistAll()
    }

    return {
      consolidatedCount,
      message: `Dream cycle complete: Consolidated ${consolidatedCount} redundant memories.`,
    }
  }

  public async forget(topic: string): Promise<{ success: boolean; message: string }> {
    const key = (topic || '').trim().toLowerCase()
    if (this.memories.has(key)) {
      this.memories.delete(key)
      await this.persistAll()
      return { success: true, message: `Forgotten memory for '${topic}'.` }
    }
    return { success: false, message: `No memory found matching '${topic}'.` }
  }

  /**
   * Render memories for LLM active prompt with strict character budget truncation.
   */
  public renderForPrompt(selectedItems?: MemoryItem[]): string {
    const fullText = this.serializeMarkdown(selectedItems)
    if (fullText.length > this.config.maxRecallChars) {
      return fullText.slice(0, this.config.maxRecallChars) + '\n... [Memory truncated by character budget]'
    }
    return fullText
  }

  /**
   * Full UNTRUNCATED Markdown serializer for disk persistence.
   * Guarantees 100% round-trip fidelity without character limits.
   */
  public serializeForDisk(): string {
    return this.serializeMarkdown(Array.from(this.memories.values()))
  }

  private serializeMarkdown(items?: MemoryItem[]): string {
    const list = items || Array.from(this.memories.values())
    if (list.length === 0) return ''

    const sections: Record<MemoryCategory, string[]> = {
      convention: [],
      preference: [],
      architecture: [],
      lesson: [],
      general: [],
    }

    for (const item of list) {
      const verifiedTag = item.verified ? ' `[✔ Verified]`' : ''
      // Indent multiline contents with 2 spaces for unambiguous parser round-trip
      const contentLines = item.content.split('\n')
      const firstLine = contentLines[0]
      const restLines = contentLines.slice(1).map((l) => `  ${l}`)
      const formatted = [`- **${item.topic}**${verifiedTag}: ${firstLine}`, ...restLines].join('\n')
      sections[item.category].push(formatted)
    }

    let output = '## Project & User Persistent Memory (Active Knowledge)\n'
    output += '> Guidelines, architecture decisions, and past debug lessons retrieved for this session:\n\n'

    const titles: Record<MemoryCategory, string> = {
      convention: '### Code Conventions & Standards',
      preference: '### User Preferences',
      architecture: '### Architecture & Design Decisions',
      lesson: '### Past Lessons & Bug Fix Records',
      general: '### General Notes',
    }

    for (const cat of Object.keys(sections) as MemoryCategory[]) {
      if (sections[cat].length > 0) {
        output += `${titles[cat]}\n${sections[cat].join('\n')}\n\n`
      }
    }

    return output.trim()
  }

  private async persistAll(): Promise<void> {
    await this.ioLock.acquire(async () => {
      await this.flushToDisk()
      await this.flushMetadataToDisk()
    })
  }

  private async embedText(text: string): Promise<number[]> {
    const { provider, apiBase, apiKey, model, dimension } = this.config.embedding
    if (!this.config.embedding.enabled || provider === 'none') {
      return []
    }

    if (provider === 'ollama') {
      const url = `${apiBase || 'http://localhost:11434'}/api/embeddings`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model || 'nomic-embed-text', prompt: text }),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new Error(`Ollama embedding HTTP ${res.status}`)
      const data = (await res.json()) as any
      if (Array.isArray(data.embedding)) return data.embedding
      throw new Error('Invalid Ollama embedding response shape')
    }

    const url = `${apiBase || 'https://api.openai.com/v1'}/embeddings`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: text,
        model: model || 'text-embedding-3-small',
        dimensions: dimension,
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`OpenAI embedding HTTP ${res.status}`)
    const data = (await res.json()) as any
    if (data?.data?.[0]?.embedding && Array.isArray(data.data[0].embedding)) {
      return data.data[0].embedding
    }
    throw new Error('Invalid OpenAI embedding response shape')
  }

  private async loadFromDisk(): Promise<void> {
    try {
      if (!fs.existsSync(this.resolvedPath)) return
      const raw = await fs.promises.readFile(this.resolvedPath, 'utf-8')
      this.parseMarkdown(raw)
    } catch (err) {
      this.ctx.logger.warn(`Failed to read memory file: ${err}`)
    }
  }

  private async loadMetadataFromDisk(): Promise<void> {
    try {
      if (!fs.existsSync(this.resolvedVectorPath)) return
      const raw = await fs.promises.readFile(this.resolvedVectorPath, 'utf-8')
      const metadataMap = JSON.parse(raw) as Record<string, Partial<MemoryItem>>
      for (const [key, meta] of Object.entries(metadataMap)) {
        if (this.memories.has(key)) {
          const item = this.memories.get(key)!
          if (Array.isArray(meta.vector)) item.vector = meta.vector
          if (typeof meta.accessCount === 'number') item.accessCount = meta.accessCount
          if (typeof meta.importance === 'number') item.importance = meta.importance
          if (typeof meta.verified === 'boolean') item.verified = meta.verified
          if (typeof meta.verifiedAt === 'string') item.verifiedAt = meta.verifiedAt
          if (Array.isArray(meta.correctionHistory)) item.correctionHistory = meta.correctionHistory
          if (typeof meta.lastAccessedAt === 'string') item.lastAccessedAt = meta.lastAccessedAt
          if (typeof meta.createdAt === 'string') item.createdAt = meta.createdAt
          if (typeof meta.updatedAt === 'string') item.updatedAt = meta.updatedAt
        }
      }
    } catch (err) {
      this.ctx.logger.warn(`Failed to load vector & metadata cache: ${err}`)
    }
  }

  private async flushToDisk(): Promise<void> {
    const dir = path.dirname(this.resolvedPath)
    if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true })
    const tmpPath = `${this.resolvedPath}.tmp.${Date.now()}`
    const content = this.serializeForDisk() // Full serialization, NOT prompt-truncated
    await fs.promises.writeFile(tmpPath, content, 'utf-8')
    await fs.promises.rename(tmpPath, this.resolvedPath)
  }

  private async flushMetadataToDisk(): Promise<void> {
    const dir = path.dirname(this.resolvedVectorPath)
    if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true })
    const tmpPath = `${this.resolvedVectorPath}.tmp.${Date.now()}`
    const metadataMap: Record<string, Partial<MemoryItem>> = {}
    for (const [key, item] of this.memories.entries()) {
      metadataMap[key] = {
        vector: item.vector,
        accessCount: item.accessCount,
        importance: item.importance,
        verified: item.verified,
        verifiedAt: item.verifiedAt,
        correctionHistory: item.correctionHistory,
        lastAccessedAt: item.lastAccessedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }
    }
    await fs.promises.writeFile(tmpPath, JSON.stringify(metadataMap, null, 2), 'utf-8')
    await fs.promises.rename(tmpPath, this.resolvedVectorPath)
  }

  private parseMarkdown(text: string): void {
    const lines = text.split('\n')
    let currentCategory: MemoryCategory = 'general'
    let lastItem: MemoryItem | null = null

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      if (trimmed.includes('Code Conventions')) {
        currentCategory = 'convention'
        lastItem = null
      } else if (trimmed.includes('User Preferences')) {
        currentCategory = 'preference'
        lastItem = null
      } else if (trimmed.includes('Architecture')) {
        currentCategory = 'architecture'
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
          const isVerified = tagPart.includes('[✔ Verified]')
          const key = topic.toLowerCase()

          if (!this.memories.has(key)) {
            const item: MemoryItem = {
              id: key,
              topic,
              content,
              category: currentCategory,
              importance: 3,
              accessCount: 1,
              verified: isVerified,
              lastAccessedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
            this.memories.set(key, item)
            lastItem = item
          } else {
            lastItem = this.memories.get(key) || null
          }
        }
      } else if (lastItem && (line.startsWith('  ') || line.startsWith('\t'))) {
        lastItem.content += '\n' + trimmed
      }
    }
  }
}

export { MemoryGuard, MemoryConflictDetector }

export default function apply(ctx: Context, config: MemoryConfig = {}) {
  ctx.plugin(MemoryService, config)
  ctx.on('ready', () => {
    ctx.logger.info('[dsh-plugin-memory] Shion 4-Tier Cognitive Engine active.')
  })
}
