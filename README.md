# @shion-lab/dsh-plugin-memory

[![npm version](https://img.shields.io/npm/v/@shion-lab/dsh-plugin-memory.svg)](https://www.npmjs.com/package/@shion-lab/dsh-plugin-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Persistent cross-session dual-layer memory (Markdown Rules + Dense Vector Semantic Search) for DeepSeek Harness (`dsh`).**

---

## 🌟 Why `dsh-plugin-memory`?

By default, DeepSeek Harness operates in a **stateless** manner: once a terminal session closes, all project-specific architectural rules, user preferences, and hard-earned debugging lessons are lost.

`@shion-lab/dsh-plugin-memory` introduces a **dual-layer memory architecture** to DeepSeek Harness:

- 📝 **Layer 1: Human-Readable Markdown (`.dsh/MEMORY.md`)**: Stores code conventions, preferences, and lessons directly in your repository (Git-trackable).
- 🧠 **Layer 2: Dense Vector Semantic Engine (`.dsh/memory_vectors.json`)**: Computes cosine vector similarity embeddings (OpenAI / Ollama / Local) to semantically retrieve relevant memories even when query phrasing differs.
- ⚡ **Auto-Recall & Context Budget Guard**: Automatically injects only the top relevant memories into the system prompt without context bloat.
- 🛡️ **Zero-Lockin / Local-First**: Works completely offline in zero-dep Markdown mode, or optionally with vector embeddings.

---

## 📦 Installation

In your DeepSeek Harness workspace:

```bash
npm install -g @shion-lab/dsh-plugin-memory
# or
yarn add @shion-lab/dsh-plugin-memory
```

---

## 🚀 Quick Start

### Mode A: Lightweight Zero-Config (Markdown-only)

Add to `cordis.yml`:

```yaml
plugins:
  "@deepseek-ai/dsh": {}
  "@shion-lab/dsh-plugin-memory":
    storagePath: ".dsh/MEMORY.md"
    autoRecall: true
    maxRecallChars: 3000
```

### Mode B: Advanced Semantic Vector Search (with Ollama or OpenAI embeddings)

```yaml
plugins:
  "@deepseek-ai/dsh": {}
  "@shion-lab/dsh-plugin-memory":
    storagePath: ".dsh/MEMORY.md"
    embedding:
      enabled: true
      provider: "ollama" # or "openai-compatible"
      apiBase: "http://localhost:11434"
      model: "nomic-embed-text"
      dimension: 768
```

---

## 🛠️ How It Works

1. **Explicit Remembering**:
   During chat, tell the agent:
   > *"Remember: Always use pytest-asyncio for async tests and avoid using sleep in tests."*
   The agent calls `remember`, persisting the rule to `.dsh/MEMORY.md` and calculating its vector embedding.

2. **Semantic Contextual Recall**:
   When you later ask:
   > *"How do we write tests for our async workers?"*
   The plugin performs vector cosine similarity search and injects the pytest-asyncio guideline into the model context.

---

## ⚙️ Configuration Reference

| Option | Type | Default | Description |
|---|---|---|---|
| `storagePath` | `string` | `".dsh/MEMORY.md"` | Path to the persistent markdown file |
| `vectorStoragePath` | `string` | `".dsh/memory_vectors.json"` | Path to vector cache |
| `autoRecall` | `boolean` | `true` | Automatically inject memories on session start |
| `maxRecallChars` | `number` | `3000` | Character budget limit for memory injection |
| `embedding.enabled` | `boolean` | `false` | Enable vector semantic search |
| `embedding.provider` | `string` | `"none"` | `"openai-compatible"` or `"ollama"` |
| `embedding.apiBase` | `string` | `""` | Embeddings endpoint URL |
| `embedding.model` | `string` | `"text-embedding-3-small"` | Embedding model name |

---

## 📄 License

MIT © [Shion Lab](https://github.com/shion-lab)
