# [RFC / Proposal] Triple-Layer Persistent Memory (Markdown Rules + Vector Embeddings + Hybrid Vitality Ranking) for DeepSeek Harness

> **TL;DR**: 为 DeepSeek Harness (`dsh`) 带来跨会话的「立体持久化记忆与经验自省引擎」。提炼自伴随式 AI 系统 **『紫苑 (Shion)』** 的多层记忆沉淀机制，支持 Git 版本化 Markdown、稠密向量余弦检索、记忆活力衰减（Half-life Decay）与双模混合召回。

---

## 📌 Motivation & Problem Statement / 核心痛点

Currently, DeepSeek Harness operates in a **stateless** paradigm. While great for clean reproducible execution, developers working on real-world projects encounter friction:

1. **冷启动失忆（Cold Start Amnesia）**：每次会话关闭后，模型便忘记了项目的架构约定与团队代码习惯（例如：“我们只用 HSL 颜色，禁止 Tailwind” 或 “测试必须使用 pytest-asyncio”）。
2. **踩坑经验无法固化（Lost Lessons）**：耗费大量 Token 调试出来的第三方库版本冲突、环境 Workaround，在下次开启会话时又得重新排查一遍。
3. **纯文本搜索与纯向量搜索的局限（Search Trade-offs）**：纯关键词搜索搜不出同义词，而纯向量检索在精准匹配函数名、错误代码时容易产生语义泛化偏差。

---

## 💡 Proposed Solution: `@shion-lab/dsh-plugin-memory`

This architecture is distilled from our long-running desktop companion AI system **Shion (紫苑)**. We extracted and redesigned its core memory dynamics into a native, zero-lockin **Cordis Plugin** for DeepSeek Harness.

### 🏛️ Triple-Layer Architecture / 三层立体记忆架构

```
                     ┌────────────────────────────────────────────────────────┐
                     │ Layer 1: Git-Tracked Markdown Rules (.dsh/MEMORY.md)   │
                     │ └── Team-versioned code conventions & arch decisions   │
                     └───────────────────────────┬────────────────────────────┘
                                                 │
                     ┌───────────────────────────▼────────────────────────────┐
                     │ Layer 2: Dense Vector Semantic Engine (.dsh/store.json)│
                     │ ├── Supports Ollama (nomic-embed / bge-m3) & OpenAI API│
                     │ └── Cosine similarity calculation for fuzzy intent     │
                     └───────────────────────────┬────────────────────────────┘
                                                 │
                     ┌───────────────────────────▼────────────────────────────┐
                     │ Layer 3: Memory Vitality & Hybrid Reciprocal Ranking   │
                     │ ├── 30-day Half-life Recency Decay (优先新鲜突破)       │
                     │ ├── Frequency Reinforcement (高频经验自动加权置顶)       │
                     │ └── Hybrid Score = 0.5*Vector + 0.3*Lexical + 0.2*Vital│
                     └────────────────────────────────────────────────────────┘
```

#### Key Capabilities / 核心特性：
1. **Layer 1: 人类可读与 Git 版本化 (`.dsh/MEMORY.md`)**：
   记忆直接以清晰的 Markdown 存放在项目仓库中，团队成员可通过 Git 共同维护和提交项目规则。
2. **Layer 2: 稠密向量语义引擎 (`.dsh/memory_store.json`)**：
   支持本地 Ollama 或 OpenAI 兼容的 Embedding 接口，即使提问词与记录词不同，也能精准语义打中。
3. **Layer 3: 记忆活力衰减与混合打分（Hybrid Ranking）**：
   融合了 **时间半衰期衰减** 与 **访问频次强化（accessCount++）**，高频核心规矩永远活跃，过时碎片自动下沉。
4. **上下文预算守卫（Context Budget Guard）**：
   在会话开始前，按综合得分仅注入最相关的 Top-K 记忆，硬截断防爆上下文。

---

## 📦 Repository & Package / 开源仓库

- **GitHub Repository**: [https://github.com/avaritiachaos/dsh-plugin-memory](https://github.com/avaritiachaos/dsh-plugin-memory)
- **NPM Package**: `@shion-lab/dsh-plugin-memory`

---

## 🔧 Quick Start in `cordis.yml` / 快速上手

### 模式 A: 零配置轻量模式（纯 Markdown，开箱即用）
```yaml
plugins:
  "@deepseek-ai/dsh": {}
  "@shion-lab/dsh-plugin-memory":
    storagePath: ".dsh/MEMORY.md"
    autoRecall: true
    maxRecallChars: 3500
```

### 模式 B: 完整混合向量语义模式（配合 Ollama 或 API 向量模型）
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
```

---

欢迎 DeepSeek 官方团队与社区小伙伴交流探讨！如果大家觉得有价值，欢迎收录进官方推荐插件生态。
