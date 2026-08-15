import { Context, Service, Schema } from 'cordis'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Memory record category.
 */
export type MemoryCategory = 'convention' | 'preference' | 'architecture' | 'lesson' | 'general'

/**
 * Enhanced memory item capturing Shion's memory dynamics:
 * - Hybrid lexical + vector representations
 * - Access count & recency decay weights (memory vitality)
 * - Importance tiering
 */
export interface MemoryItem {
  id: string
  category: MemoryCategory
  topic: string
  content: string
  importance: number // 1 (low) to 5 (critical)
  accessCount: number // Incremented on each recall hit
  lastAccessedAt: string
  createdAt: string
  updatedAt: string
  /** Optional dense vector embedding for semantic search */
  vector?: number[]
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

/**
 * Configuration options for the Memory Plugin.
 */
export interface MemoryConfig {
  /** File path to persist memories. Default is `.dsh/MEMORY.md` */
  storagePath?: string
  /** File path to persist vector cache and access metadata. Default is `.dsh/memory_store.json` */
  vectorStoragePath?: string
  /** Whether to automatically inject memories into the system context on session start. */
  autoRecall?: boolean
  /** Maximum character budget for injected memories. */
  maxRecallChars?: number
  /** Number of top relevant memories to inject during automatic recall. */
  topK?: number
  /** Vector Embedding configuration for semantic search */
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
 * Cosine Similarity between two dense vectors.
 */
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

/**
 * Calculate Recency score based on days elapsed (Half-life decay).
 */
function calculateRecencyScore(dateString: string): number {
  try {
    const elapsedMs = Date.now() - new Date(dateString).getTime()
    const days = Math.max(0, elapsedMs / (1000 * 60 * 60 * 24))
    // 30-day half-life decay
    return Math.exp(-days / 30)
  } catch {
    return 0.5
  }
}

/**
 * DeepSeek Harness Long-term Memory Service.
 * 
 * Inspired by Shion's triple-layer memory architecture:
 * 1. Layer 1 (Human-in-the-Loop): Git-versioned Markdown knowledge base (.dsh/MEMORY.md)
 * 2. Layer 2 (Semantic Dynamics): Dense vector index + Cosine similarity
 * 3. Layer 3 (Memory Vitality & Hybrid Ranking): Recency decay + Frequency reinforcement + Reciprocal Rank Fusion
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
      `[dsh-plugin-memory] Memory engine active: ${this.memories.size} items (Vector Semantic Engine: ${
        this.config.embedding.enabled ? 'ON' : 'OFF'
      }, Hybrid Fusion: ON)`
    )
  }

  /**
   * Save or update memory with automatic consolidation, vectorization, and vitality initialization.
   */
  public async remember(
    topic: string,
    content: string,
    category: MemoryCategory = 'general',
    importance: number = 3
  ): Promise<{ success: boolean; id: string; message: string }> {
    const key = topic.trim().toLowerCase()
    let vector: number[] | undefined

    if (this.config.embedding.enabled) {
      try {
        vector = await this.embedText(`${topic}: ${content}`)
      } catch (err) {
        this.ctx.logger.warn(`Vector embedding failed for '${topic}': ${err}`)
      }
    }

    const now = new Date().toISOString()
    const existing = this.memories.get(key)

    const item: MemoryItem = {
      id: key,
      topic: topic.trim(),
      content: content.trim(),
      category,
      importance: Math.min(5, Math.max(1, importance)),
      accessCount: existing ? existing.accessCount + 1 : 1,
      lastAccessedAt: now,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      vector: vector || existing?.vector,
    }

    this.memories.set(key, item)
    await this.flushToDisk()
    await this.flushMetadataToDisk()

    return {
      success: true,
      id: key,
      message: `Remembered '${topic}' under [${category}] (importance: ${importance}/5, vector: ${vector ? 'yes' : 'cached/no'}).`,
    }
  }

  /**
   * Hybrid Memory Recall:
   * Combines Lexical keyword matching + Vector semantic similarity + Memory Vitality (recency/frequency).
   */
  public async recall(query?: string, topK?: number): Promise<MemoryItem[]> {
    const k = topK || this.config.topK
    const items = Array.from(this.memories.values())
    if (items.length === 0) return []

    if (!query || !query.trim()) {
      // Default: Return top items by importance and frequency
      return items
        .sort((a, b) => b.importance * 2 + Math.log(b.accessCount + 1) - (a.importance * 2 + Math.log(a.accessCount + 1)))
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

    // Hybrid Scoring (Shion ranking formula)
    const scored = items.map((item) => {
      // 1. Semantic score
      const semanticScore = queryVec && item.vector ? cosineSimilarity(queryVec, item.vector) : 0

      // 2. Lexical exact/partial match score
      let lexicalScore = 0
      if (item.topic.toLowerCase().includes(queryLower)) lexicalScore += 0.6
      if (item.content.toLowerCase().includes(queryLower)) lexicalScore += 0.4
      if (item.category.toLowerCase() === queryLower) lexicalScore += 0.3

      // 3. Vitality & Importance factor
      const recencyScore = calculateRecencyScore(item.lastAccessedAt || item.updatedAt)
      const frequencyScore = Math.min(1.0, Math.log10(item.accessCount + 1) / 2) // Log saturation
      const importanceScore = item.importance / 5.0

      // Composite Weighted Score
      const totalScore =
        (queryVec ? semanticScore * 0.5 : 0) +
        lexicalScore * (queryVec ? 0.3 : 0.7) +
        recencyScore * 0.1 +
        frequencyScore * 0.05 +
        importanceScore * 0.05

      return { item, totalScore }
    })

    const results = scored
      .filter((s) => s.totalScore > 0.05)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, k)
      .map((s) => {
        // Reinforce accessed memories
        s.item.accessCount++
        s.item.lastAccessedAt = now
        return s.item
      })

    // Async save updated access counts
    this.flushMetadataToDisk().catch(() => {})

    return results
  }

  /**
   * Remove a memory item.
   */
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

  /**
   * Render memories as formatted Markdown for system prompt injection.
   */
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
      sections[item.category].push(`- **${item.topic}**: ${item.content}`)
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
        const match = trimmed.match(/^- \*\*(.*?)\*\*:\s*(.*)$/)
        if (match) {
          const topic = match[1].trim()
          const content = match[2].trim()
          const key = topic.toLowerCase()
          if (!this.memories.has(key)) {
            const item: MemoryItem = {
              id: key,
              topic,
              content,
              category: currentCategory,
              importance: 3,
              accessCount: 1,
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
        // Append multiline indented text to previous memory item
        lastItem.content += '\n' + trimmed
      }
    }
  }
}

export default function apply(ctx: Context, config: MemoryConfig = {}) {
  ctx.plugin(MemoryService, config)
  ctx.on('ready', () => {
    ctx.logger.info('[dsh-plugin-memory] Shion-inspired Triple-layer Memory Engine active.')
  })
}
