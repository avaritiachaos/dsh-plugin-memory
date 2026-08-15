import { Context, Service, Schema } from 'cordis'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Memory record category.
 */
export type MemoryCategory = 'convention' | 'preference' | 'architecture' | 'lesson' | 'general'

/**
 * Single structured memory item with optional dense vector embedding.
 */
export interface MemoryItem {
  id: string
  category: MemoryCategory
  topic: string
  content: string
  updatedAt: string
  /** Optional dense vector embedding for semantic search */
  vector?: number[]
}

export interface EmbeddingConfig {
  /** Enabled semantic vector search */
  enabled?: boolean
  /** Provider: 'openai-compatible' | 'ollama' | 'none' */
  provider?: 'openai-compatible' | 'ollama' | 'none'
  /** API Base URL for embedding endpoint (e.g. http://localhost:11434 or https://api.openai.com/v1) */
  apiBase?: string
  /** API Key (if required) */
  apiKey?: string
  /** Embedding model name (e.g. 'bge-m3', 'text-embedding-3-small', 'nomic-embed-text') */
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
  /** File path to persist vector cache. Default is `.dsh/memory_vectors.json` */
  vectorStoragePath?: string
  /** Whether to automatically inject memories into the system context on session start. */
  autoRecall?: boolean
  /** Maximum character budget for injected memories. */
  maxRecallChars?: number
  /** Vector Embedding configuration for semantic search */
  embedding?: EmbeddingConfig
}

export const MemoryConfig: Schema<MemoryConfig> = Schema.object({
  storagePath: Schema.string().default('.dsh/MEMORY.md').description('Path to persistent markdown memory file.'),
  vectorStoragePath: Schema.string().default('.dsh/memory_vectors.json').description('Path to vector index cache.'),
  autoRecall: Schema.boolean().default(true).description('Inject relevant memories into session prompt automatically.'),
  maxRecallChars: Schema.number().default(3000).description('Character budget limit for injected memory section.'),
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
 * Calculate Cosine Similarity between two dense float vectors.
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0
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
 * DeepSeek Harness Long-term Memory Service.
 * Implements dual-layer memory:
 * Layer 1: Human-readable Markdown persistence (.dsh/MEMORY.md)
 * Layer 2: Semantic Vector Index & Cosine Recall (.dsh/memory_vectors.json)
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
      vectorStoragePath: config.vectorStoragePath || '.dsh/memory_vectors.json',
      autoRecall: config.autoRecall ?? true,
      maxRecallChars: config.maxRecallChars ?? 3000,
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
    await this.loadVectorsFromDisk()
    this.ctx.logger.info(
      `[dsh-plugin-memory] Initialized with ${this.memories.size} memories (Vector Search: ${
        this.config.embedding.enabled ? 'ON' : 'OFF'
      })`
    )
  }

  /**
   * Save or update a memory item and generate vector embedding if enabled.
   */
  public async remember(
    topic: string,
    content: string,
    category: MemoryCategory = 'general'
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

    const item: MemoryItem = {
      id: key,
      topic: topic.trim(),
      content: content.trim(),
      category,
      updatedAt: new Date().toISOString().split('T')[0],
      vector,
    }

    this.memories.set(key, item)
    await this.flushToDisk()
    if (vector) {
      await this.flushVectorsToDisk()
    }

    return {
      success: true,
      id: key,
      message: `Successfully remembered '${topic}' under [${category}] (Vector: ${vector ? 'yes' : 'no'}).`,
    }
  }

  /**
   * Semantic Recall: Computes vector similarity or falls back to fuzzy string matching.
   */
  public async recall(query?: string, topK: number = 5): Promise<MemoryItem[]> {
    const items = Array.from(this.memories.values())
    if (!query || !query.trim()) {
      return items
    }

    // Vector Semantic Search
    if (this.config.embedding.enabled) {
      try {
        const queryVec = await this.embedText(query)
        const scored = items
          .filter((item) => item.vector && item.vector.length > 0)
          .map((item) => ({
            item,
            score: cosineSimilarity(queryVec, item.vector!),
          }))
          .sort((a, b) => b.score - a.score)

        if (scored.length > 0) {
          return scored.slice(0, topK).map((s) => s.item)
        }
      } catch (err) {
        this.ctx.logger.warn(`Semantic vector search failed, falling back to lexical search: ${err}`)
      }
    }

    // Fallback: Lexical keyword search
    const q = query.trim().toLowerCase()
    return items.filter(
      (m) =>
        m.topic.toLowerCase().includes(q) ||
        m.content.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)
    )
  }

  /**
   * Forget a memory by topic or id.
   */
  public async forget(topic: string): Promise<{ success: boolean; message: string }> {
    const key = topic.trim().toLowerCase()
    if (this.memories.has(key)) {
      this.memories.delete(key)
      await this.flushToDisk()
      await this.flushVectorsToDisk()
      return { success: true, message: `Forgotten memory for '${topic}'.` }
    }
    return { success: false, message: `No memory found matching '${topic}'.` }
  }

  /**
   * Render memories as formatted Markdown for prompt injection.
   */
  public renderForPrompt(selectedItems?: MemoryItem[]): string {
    const items = selectedItems || Array.from(this.memories.values())
    if (items.length === 0) {
      return ''
    }

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

    let output = '## Project & User Persistent Memory\n'
    output += '> The following guidelines and lessons have been established across past sessions:\n\n'

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

  /**
   * Request embedding vector from configured endpoint.
   */
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

    // Default OpenAI-compatible endpoint
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

  private async loadVectorsFromDisk(): Promise<void> {
    try {
      if (!fs.existsSync(this.resolvedVectorPath)) return
      const raw = await fs.promises.readFile(this.resolvedVectorPath, 'utf-8')
      const vectorMap = JSON.parse(raw) as Record<string, number[]>
      for (const [key, vector] of Object.entries(vectorMap)) {
        if (this.memories.has(key)) {
          this.memories.get(key)!.vector = vector
        }
      }
    } catch (err) {
      this.ctx.logger.warn(`Failed to load vector cache: ${err}`)
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

  private async flushVectorsToDisk(): Promise<void> {
    try {
      const dir = path.dirname(this.resolvedVectorPath)
      if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true })
      const vectorMap: Record<string, number[]> = {}
      for (const [key, item] of this.memories.entries()) {
        if (item.vector) vectorMap[key] = item.vector
      }
      await fs.promises.writeFile(this.resolvedVectorPath, JSON.stringify(vectorMap, null, 2), 'utf-8')
    } catch (err) {
      this.ctx.logger.error(`Failed to flush vector index: ${err}`)
    }
  }

  private parseMarkdown(text: string): void {
    const lines = text.split('\n')
    let currentCategory: MemoryCategory = 'general'

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.includes('Code Conventions')) currentCategory = 'convention'
      else if (trimmed.includes('User Preferences')) currentCategory = 'preference'
      else if (trimmed.includes('Architecture')) currentCategory = 'architecture'
      else if (trimmed.includes('Past Lessons')) currentCategory = 'lesson'
      else if (trimmed.startsWith('- **')) {
        const match = trimmed.match(/^- \*\*(.*?)\*\*:\s*(.*)$/)
        if (match) {
          const topic = match[1].trim()
          const content = match[2].trim()
          this.memories.set(topic.toLowerCase(), {
            id: topic.toLowerCase(),
            topic,
            content,
            category: currentCategory,
            updatedAt: new Date().toISOString().split('T')[0],
          })
        }
      }
    }
  }
}

export default function apply(ctx: Context, config: MemoryConfig = {}) {
  ctx.plugin(MemoryService, config)
  ctx.on('ready', () => {
    ctx.logger.info('[dsh-plugin-memory] Long-term memory engine ready (Markdown + Semantic Vectors).')
  })
}
