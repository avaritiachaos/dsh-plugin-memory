# @shion-lab/dsh-plugin-memory

[![npm version](https://img.shields.io/npm/v/@shion-lab/dsh-plugin-memory.svg)](https://www.npmjs.com/package/@shion-lab/dsh-plugin-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Industrial-grade 4-tier persistent memory, self-correction, and cognitive defense engine for DeepSeek Harness (`dsh`).**
> 
> *Featuring Git-tracked Markdown storage, dense vector semantic search, red-light pollution guards, polarity conflict detection, and half-life recency decay.*
> 
> *Distilled from the battle-tested memory dynamics of desktop companion AI system **Shion (紫苑)**.*

---

## 🌟 Why `dsh-plugin-memory`? / 为什么需要立体持久记忆与自省防护？

By default, DeepSeek Harness operates in a **stateless** manner: once a session closes, all project-specific architectural rules, user preferences, and hard-earned debugging lessons are lost.

Furthermore, naive memory plugins suffer from **memory pollution, hallucinations, and polarity conflicts** (e.g. saving stack traces or conflicting rules).

`@shion-lab/dsh-plugin-memory` introduces a **production-grade 4-tier cognitive architecture** directly ported from companion agent practices (提炼自伴随式智能体「紫苑」实战记忆体系):

- 🛡️ **Tier 1: MemoryGuard (Red-light Anti-Pollution Gate)**:
  - Strictly blocks stack traces (`Traceback...`), test runner output (`pytest PASSED/FAILED`), diff blocks, and API secrets (`sk-...`) from polluting memory.
- ⚖️ **Tier 2: MemoryConflictDetector (Subject & Polarity Resolution)**:
  - Automatically identifies and resolves contradictory rules on the same subject (e.g. `forbid tailwind` vs `require tailwind`), archiving outdated rules and preventing split-brain directives.
- 📝 **Tier 3: Git-Tracked Markdown Knowledge Base (`.dsh/MEMORY.md`)**:
  - Human-in-the-loop, version-controlled repository conventions with `[✔ Verified]` test-passed badges.
- 🧠 **Tier 4: Dense Vector Hybrid Vitality Engine (`.dsh/memory_store.json`)**:
  - **Dense Vectors**: Cosine similarity semantic search (OpenAI / Ollama).
  - **Recency Decay**: 30-day half-life exponential decay.
  - **Frequency Reinforcement**: Automatically reinforces frequently accessed wisdom.
  - **Dream Consolidation (`dream()`)**: Background clustering and duplicate merging.

---

## 📦 Installation

```bash
npm install -g @shion-lab/dsh-plugin-memory
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

## 🛠️ API & Tool Calling Reference

- `remember(topic, content, options)`: Persists rule with red-light checks, conflict resolution, and optional `{ verified: true }` certification.
- `correct(topic, newContent, reason)`: Explicitly corrects or supersedes outdated knowledge, recording an audit trail.
- `recall(query, topK)`: Hybrid RRF recall with verification bonus and recency decay.
- `dream()`: Consolidates duplicate fragments and optimizes memory budget.
- `forget(topic)`: Deletes specified memory item.

---

## 📄 License

MIT © [Shion Lab](https://github.com/shion-lab)
