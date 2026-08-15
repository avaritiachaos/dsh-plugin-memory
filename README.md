# @shion-lab/dsh-plugin-memory

[![npm version](https://img.shields.io/npm/v/@shion-lab/dsh-plugin-memory.svg)](https://www.npmjs.com/package/@shion-lab/dsh-plugin-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Persistent triple-layer long-term memory engine for DeepSeek Harness (`dsh`), featuring Git-tracked Markdown storage, dense vector embeddings, and access-frequency/recency hybrid recall.**
> 
> *Distilled from the battle-tested memory dynamics of desktop companion AI system **Shion (紫苑)**.*

---

## 🌟 Why `dsh-plugin-memory`? / 为什么需要立体持久记忆？

By default, DeepSeek Harness operates in a **stateless** manner: once a session closes, all project-specific architectural rules, user preferences, and hard-earned debugging lessons are lost.

`@shion-lab/dsh-plugin-memory` introduces a **production-grade triple-layer memory architecture** directly adapted from desktop companion agent practices (提炼自伴随式智能体「紫苑」实战记忆体系):

- 📝 **Layer 1: Human-in-the-Loop Git Markdown (`.dsh/MEMORY.md`)**: Team-shareable, version-controlled repository conventions and architecture rules.
- 🧠 **Layer 2: Dense Vector Semantic Engine (`.dsh/memory_store.json`)**: Dense vector embeddings with Cosine Similarity ranking (OpenAI / Ollama / Local).
- 📈 **Layer 3: Memory Vitality & Hybrid Ranking (RRF)**:
  - **Recency Decay**: Smooth half-life decay prioritizing recent breakthroughs.
  - **Frequency Reinforcement**: Automatically reinforces frequently accessed wisdom.
  - **Hybrid Fusion**: Combines lexical keywords (BM25-style) with semantic vector distances to avoid hallucinated recalls.
- 🛡️ **Budget Guard**: Injects top-K high-value memories without blowing up token context limits.

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
    maxRecallChars: 3500
```

### Mode B: Full Semantic Hybrid Vector Engine (with Ollama or OpenAI embeddings)

```yaml
plugins:
  "@deepseek-ai/dsh": {}
  "@shion-lab/dsh-plugin-memory":
    storagePath: ".dsh/MEMORY.md"
    topK: 6
    embedding:
      enabled: true
      provider: "ollama" # or "openai-compatible"
      apiBase: "http://localhost:11434"
      model: "nomic-embed-text"
      dimension: 768
```

---

## 🛠️ How It Works

1. **Natural Interaction**:
   During chat, instruct DeepSeek:
   > *"Remember: In this repository we use Vitest instead of Jest, and mock network calls using MSW."*
   The agent calls `remember`, persisting the rule with importance tiering, updating the Git Markdown file, and caching its vector embedding.

2. **Automatic Contextual Recall**:
   On your next task, when you ask:
   > *"Write a test for the auth login endpoint."*
   The plugin runs hybrid ranking, automatically surfacing the Vitest & MSW conventions into the active prompt.

---

## ⚙️ Configuration Reference

| Option | Type | Default | Description |
|---|---|---|---|
| `storagePath` | `string` | `".dsh/MEMORY.md"` | Path to the persistent markdown file |
| `vectorStoragePath` | `string` | `".dsh/memory_store.json"` | Path to vector cache & access metadata |
| `autoRecall` | `boolean` | `true` | Automatically inject memories on session start |
| `maxRecallChars` | `number` | `3500` | Character budget limit for memory injection |
| `topK` | `number` | `6` | Number of top scored memories to recall |
| `embedding.enabled` | `boolean` | `false` | Enable vector semantic search |
| `embedding.provider` | `string` | `"none"` | `"openai-compatible"` or `"ollama"` |
| `embedding.apiBase` | `string` | `""` | Embeddings endpoint URL |
| `embedding.model` | `string` | `"text-embedding-3-small"` | Embedding model name |

---

## 📄 License

MIT © [Shion Lab](https://github.com/shion-lab)
