import { Context, Service, Schema } from 'cordis'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { MemoryGuard } from './guard.js'
import { MemoryConflictDetector } from './conflict.js'

/**
 * Memory record category.
 */
export type MemoryCategory = 'convention' | 'preference' | 'architecture' | 'lesson' | 'general'

/**
 * Enhanced memory item capturing Shion's self-correcting memory dynamics:
 * - Hybrid lexical + vector representations
 * - Access count & recency decay weights (memory vitality)
 * - Importance tiering
 * - Verification status & audit trail (Anti-hallucination guard)
 * - Polarity conflict history & supersession tracking
 */
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
  correctionHistory?: string[] // Audit trail of past corrections & conflict resolutions
  /** Optional dense vector embedding for semantic search */
  vector?: number[]
}

export interface RememberOptions {
  category?: MemoryCategory
  importance?: number
  verified?: boolean
  verificationProof?: string
}

export interface EmbeddingConfig {
  /** Enabled semantic vector search */
  enabled?: boolean
  /** Provider: 'openai-compatible' | 'ollama' | 'none' */
  provider?: 'openai-compatible' | 'ollama' | 'none'
  /** API Base URL for embedding endpoint */
  apiBase?: string
  /** API Key (if required) */
  apiKey?: string
  /** Embedding model name */
  model?: string
  /** Dimension of the embedding model */
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

function cosineSimilarity(vecA: number[], vecB: number[]): number {
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

function calculateRecencyScore(dateString: string): number {
  try {
    const elapsedMs = Date.now() - new Date(dateString).getTime()
    const days = Math.max(0, elapsedMs / (1000 * 60 * 60 * 24))
    return Math.exp(-days / 30)
  } catch {
    return 0.5
  }
}

/**
 * DeepSeek Harness Long-term Memory Service.
 * Full Shion Architecture implementation:
 * 1. MemoryGuard (Red-light filtering)
 * 2. MemoryConflictDetector (Subject & polarity conflict resolution)
 * 3. Triple-Layer Storage (Git Markdown + Dense Vector + Hybrid Vitality Decay)
 * 4. Dream & Reflection Engine (Consolidation, deduplication, audit trail)
 */
export class MemoryService extends Service {
  private config: Required<Omit<MemoryConfig, 'embedding'>> & { embedding: Required<EmbeddingConfig> }
  private memories: Map<string, MemoryItem> = new Map()
  private resolvedPath: string = ''
  private resolvedVectorPath: string = ''

  constructor(ctx: Context, config: MemoryConfig = {}) {
    super(ctx, 'memory', true)
    this.config = {
      storagePath: config.storagePath || '.dsh/MEMORY.md',
      vectorStoragePath: config.vectorStoragePath || '.dsh/memory_store.json',
      autoRecall: config.autoRecall ?? true,
      maxRecallChars: config.maxRecallChars ?? 3500,
      topK: config.topK ?? 6,
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
      `[dsh-plugin-memory] Shion 4-Tier Memory Engine active: ${this.memories.size} items (Guard: ON, ConflictDetector: ON, Vector: ${
        this.config.embedding.enabled ? 'ON' : 'OFF'
      })`
    )
  }

  /**
   * Save or update memory with automatic red-light guard, conflict resolution, and vectorization.
   */
  public async remember(
    topic: string,
    content: string,
    options: RememberOptions | MemoryCategory = 'general',
    importanceArg: number = 3
  ): Promise<{ success: boolean; id: string; message: string }> {
    // 1. Shion MemoryGuard Red-light check
    const guardCheck = MemoryGuard.isRedLight(content)
    if (guardCheck.blocked) {
      this.ctx.logger.warn(`[dsh-plugin-memory] Red-light blocked memory '${topic}': ${guardCheck.reason}`)
      return {
        success: false,
        id: '',
        message: `Blocked by MemoryGuard: ${guardCheck.reason}`,
      }
    }

    const key = topic.trim().toLowerCase()
    const category: MemoryCategory = typeof options === 'string' ? options : options.category || 'general'
    const importance: number = typeof options === 'object' && options.importance !== undefined ? options.importance : importanceArg
    const verified: boolean = typeof options === 'object' && options.verified !== undefined ? options.verified : false

    const now = new Date().toISOString()
    const existing = this.memories.get(key)
    const history: string[] = existing?.correctionHistory ? [...existing.correctionHistory] : []

    // 2. Shion Polarity Conflict Detection across all active memories
    for (const [otherKey, otherItem] of this.memories.entries()) {
      const conflict = MemoryConflictDetector.detectConflict(content, otherItem.content)
      if (conflict) {
        history.push(`[${now}] Conflict Resolved: Overrode previous rule '${otherItem.topic}' (${conflict.reason})`)
        this.ctx.logger.info(`[dsh-plugin-memory] Auto-resolved polarity conflict: ${conflict.reason}`)
        if (otherKey !== key) {
          this.memories.delete(otherKey)
        }
      }
    }

    let vector: number[] | undefined
    if (this.config.embedding.enabled) {
      try {
        vector = await this.embedText(`${topic}: ${content}`)
      } catch (err) {
        this.ctx.logger.warn(`Vector embedding failed for '${topic}': ${err}`)
      }
    }

    const item: MemoryItem = {
      id: key,
      topic: topic.trim(),
      content: content.trim(),
      category,
      importance: Math.min(5, Math.max(1, importance)),
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
    await this.flushToDisk()
    await this.flushMetadataToDisk()

    return {
      success: true,
      id: key,
      message: `Remembered '${topic}' under [${category}] (verified: ${item.verified ? 'YES' : 'NO'}, importance: ${importance}/5).`,
    }
  }

  /**
   * Explicitly correct or supersede an existing memory, preventing compounding errors.
   */
  public async correct(
    topic: string,
    correctedContent: string,
    reason: string = 'User correction'
  ): Promise<{ success: boolean; message: string }> {
    const guardCheck = MemoryGuard.isRedLight(correctedContent)
    if (guardCheck.blocked) {
      return { success: false, message: `Correction blocked by MemoryGuard: ${guardCheck.reason}` }
    }

    const key = topic.trim().toLowerCase()
    const existing = this.memories.get(key)
    const now = new Date().toISOString()

    const previousContent = existing ? existing.content : '(new)'
    const historyEntry = `[${now}] Corrected: "${previousContent.slice(0, 50)}..." -> "${correctedContent.slice(0, 50)}..." (Reason: ${reason})`

    let vector: number[] | undefined
    if (this.config.embedding.enabled) {
      try {
        vector = await this.embedText(`${topic}: ${correctedContent}`)
      } catch (err) {
        this.ctx.logger.warn(`Vector update failed for '${topic}': ${err}`)
      }
    }

    const item: MemoryItem = {
      id: key,
      topic: topic.trim(),
      content: correctedContent.trim(),
      category: existing?.category || 'lesson',
      importance: existing ? Math.min(5, existing.importance + 1) : 4,
      accessCount: existing ? existing.accessCount + 1 : 1,
      verified: true,
      verifiedAt: now,
      lastAccessedAt: now,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      correctionHistory: [...(existing?.correctionHistory || []), historyEntry],
      vector: vector || existing?.vector,
    }

    this.memories.set(key, item)
    await this.flushToDisk()
    await this.flushMetadataToDisk()

    return {
      success: true,
      message: `Successfully corrected memory for '${topic}'. Marked as verified.`,
    }
  }

  /**
   * Shion-inspired Dream Consolidation Engine:
   * Cleans expired candidates, resolves duplicates, and optimizes prompt budgets.
   */
  public async dream(): Promise<{ consolidatedCount: number; message: string }> {
    const items = Array.from(this.memories.values())
    let consolidatedCount = 0

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const itemA = items[i]
        const itemB = items[j]
        if (!itemA || !itemB) continue

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
          primary.content = `${primary.content} (Consolidated: ${secondary.content})`
          this.memories.delete(secondary.id)
          consolidatedCount++
        }
      }
    }

    if (consolidatedCount > 0) {
      await this.flushToDisk()
      await this.flushMetadataToDisk()
    }

    return {
      consolidatedCount,
      message: `Dream cycle complete: Consolidated ${consolidatedCount} redundant memories.`,
    }
  }

  public async recall(query?: string, topK?: number): Promise<MemoryItem[]> {
    const k = topK || this.config.topK
    const items = Array.from(this.memories.values())
    if (items.length === 0) return []

    if (!query || !query.trim()) {
      return items
        .sort(
          (a, b) =>
            b.importance * 2 + (b.verified ? 2 : 0) + Math.log(b.accessCount + 1) -
            (a.importance * 2 + (a.verified ? 2 : 0) + Math.log(a.accessCount + 1))
        )
        .slice(0, k)
    }

    const now = new Date().toISOString()
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

    this.flushMetadataToDisk().catch(() => {})
    return results
  }

  public async forget(topic: string): Promise<{ success: boolean; message: string }> {
    const key = topic.trim().toLowerCase()
    if (this.memories.has(key)) {
      this.memories.delete(key)
      await this.flushToDisk()
      await this.flushMetadataToDisk()
      return { success: true, message: `Forgotten memory for '${topic}'.` }
    }
    return { success: false, message: `No memory found matching '${topic}'.` }
  }

  public renderForPrompt(selectedItems?: MemoryItem[]): string {
    const items = selectedItems || Array.from(this.memories.values())
    if (items.length === 0) return ''

    const sections: Record<MemoryCategory, string[]> = {
      convention: [],
      preference: [],
      architecture: [],
      lesson: [],
      general: [],
    }

    for (const item of items) {
      const verifiedTag = item.verified ? ' `[✔ Verified]`' : ''
      sections[item.category].push(`- **${item.topic}**${verifiedTag}: ${item.content}`)
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

    if (output.length > this.config.maxRecallChars) {
      output = output.slice(0, this.config.maxRecallChars) + '\n... [Memory truncated by character budget]'
    }

    return output.trim()
  }

  private async embedText(text: string): Promise<number[]> {
    const { provider, apiBase, apiKey, model } = this.config.embedding
    if (provider === 'ollama') {
      const url = `${apiBase || 'http://localhost:11434'}/api/embeddings`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model || 'nomic-embed-text', prompt: text }),
      })
      const data = (await res.json()) as { embedding: number[] }
      return data.embedding
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
      }),
    })
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> }
    return data.data[0].embedding
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
          if (meta.vector) item.vector = meta.vector
          if (meta.accessCount) item.accessCount = meta.accessCount
          if (meta.importance) item.importance = meta.importance
          if (meta.verified !== undefined) item.verified = meta.verified
          if (meta.verifiedAt) item.verifiedAt = meta.verifiedAt
          if (meta.correctionHistory) item.correctionHistory = meta.correctionHistory
          if (meta.lastAccessedAt) item.lastAccessedAt = meta.lastAccessedAt
          if (meta.createdAt) item.createdAt = meta.createdAt
        }
      }
    } catch (err) {
      this.ctx.logger.warn(`Failed to load vector & metadata cache: ${err}`)
    }
  }

  private async flushToDisk(): Promise<void> {
    try {
      const dir = path.dirname(this.resolvedPath)
      if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true })
      await fs.promises.writeFile(this.resolvedPath, this.renderForPrompt(), 'utf-8')
    } catch (err) {
      this.ctx.logger.error(`Failed to flush memories: ${err}`)
    }
  }

  private async flushMetadataToDisk(): Promise<void> {
    try {
      const dir = path.dirname(this.resolvedVectorPath)
      if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true })
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
      await fs.promises.writeFile(this.resolvedVectorPath, JSON.stringify(metadataMap, null, 2), 'utf-8')
    } catch (err) {
      this.ctx.logger.error(`Failed to flush vector index & metadata: ${err}`)
    }
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
    ctx.logger.info('[dsh-plugin-memory] Shion 4-Tier Memory & Conflict-Resolution Engine active.')
  })
}
