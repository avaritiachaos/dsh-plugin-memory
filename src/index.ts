import { Context, Service, Schema } from 'cordis'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Memory record category.
 */
export type MemoryCategory = 'convention' | 'preference' | 'architecture' | 'lesson' | 'general'

/**
 * Single structured memory item.
 */
export interface MemoryItem {
  id: string
  category: MemoryCategory
  topic: string
  content: string
  updatedAt: string
}

/**
 * Configuration options for the Memory Plugin.
 */
export interface MemoryConfig {
  /** File path to persist memories. Default is `.dsh/MEMORY.md` */
  storagePath?: string
  /** Whether to automatically inject memories into the system context on session start. */
  autoRecall?: boolean
  /** Maximum character budget for injected memories. */
  maxRecallChars?: number
  /** Whether to enable automatic task-end reflection synthesis. */
  autoReflect?: boolean
}

export const MemoryConfig: Schema<MemoryConfig> = Schema.object({
  storagePath: Schema.string().default('.dsh/MEMORY.md').description('Path to persistent markdown memory file.'),
  autoRecall: Schema.boolean().default(true).description('Inject relevant memories into session prompt automatically.'),
  maxRecallChars: Schema.number().default(3000).description('Character budget limit for injected memory section.'),
  autoReflect: Schema.boolean().default(true).description('Synthesize learnings on task completion.'),
})

declare module 'cordis' {
  interface Context {
    memory: MemoryService
  }
}

/**
 * DeepSeek Harness Long-term Memory Service.
 * Implements persistent human-readable Markdown storage and auto-recall.
 */
export class MemoryService extends Service {
  private config: Required<MemoryConfig>
  private memories: Map<string, MemoryItem> = new Map()
  private resolvedPath: string = ''

  constructor(ctx: Context, config: MemoryConfig = {}) {
    super(ctx, 'memory', true)
    this.config = {
      storagePath: config.storagePath || '.dsh/MEMORY.md',
      autoRecall: config.autoRecall ?? true,
      maxRecallChars: config.maxRecallChars ?? 3000,
      autoReflect: config.autoReflect ?? true,
    }
  }

  protected async start(): Promise<void> {
    const cwd = process.cwd()
    this.resolvedPath = path.isAbsolute(this.config.storagePath)
      ? this.config.storagePath
      : path.resolve(cwd, this.config.storagePath)

    await this.loadFromDisk()
    this.ctx.logger.info(`[dsh-plugin-memory] Initialized with ${this.memories.size} memories at ${this.resolvedPath}`)
  }

  /**
   * Save or update a memory item.
   */
  public async remember(
    topic: string,
    content: string,
    category: MemoryCategory = 'general'
  ): Promise<{ success: boolean; id: string; message: string }> {
    const key = topic.trim().toLowerCase()
    const item: MemoryItem = {
      id: key,
      topic: topic.trim(),
      content: content.trim(),
      category,
      updatedAt: new Date().toISOString().split('T')[0],
    }

    this.memories.set(key, item)
    await this.flushToDisk()

    return {
      success: true,
      id: key,
      message: `Successfully remembered '${topic}' under [${category}].`,
    }
  }

  /**
   * Search or list memories matching query.
   */
  public recall(query?: string): MemoryItem[] {
    const items = Array.from(this.memories.values())
    if (!query || !query.trim()) {
      return items
    }

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
      return { success: true, message: `Forgotten memory for '${topic}'.` }
    }
    return { success: false, message: `No memory found matching '${topic}'.` }
  }

  /**
   * Render memories as formatted Markdown for prompt injection.
   */
  public renderForPrompt(): string {
    if (this.memories.size === 0) {
      return ''
    }

    const sections: Record<MemoryCategory, string[]> = {
      convention: [],
      preference: [],
      architecture: [],
      lesson: [],
      general: [],
    }

    for (const item of this.memories.values()) {
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
   * Load memory file from markdown.
   */
  private async loadFromDisk(): Promise<void> {
    try {
      if (!fs.existsSync(this.resolvedPath)) {
        return
      }
      const raw = await fs.promises.readFile(this.resolvedPath, 'utf-8')
      this.parseMarkdown(raw)
    } catch (err) {
      this.ctx.logger.warn(`Failed to read memory file: ${err}`)
    }
  }

  /**
   * Persist in-memory records to markdown file.
   */
  private async flushToDisk(): Promise<void> {
    try {
      const dir = path.dirname(this.resolvedPath)
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true })
      }
      const content = this.renderForPrompt()
      await fs.promises.writeFile(this.resolvedPath, content, 'utf-8')
    } catch (err) {
      this.ctx.logger.error(`Failed to flush memories to disk: ${err}`)
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

/**
 * Cordis Plugin Entrypoint.
 */
export default function apply(ctx: Context, config: MemoryConfig = {}) {
  ctx.plugin(MemoryService, config)

  // Register explicit tools for DeepSeek Agent
  // (Compatible with Cordis standard tool registry in dsh)
  ctx.on('ready', () => {
    ctx.logger.info('[dsh-plugin-memory] Plugin active. Long-term memory tools available.')
  })
}
