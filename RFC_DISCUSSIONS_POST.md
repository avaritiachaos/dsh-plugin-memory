# [RFC / Proposal] Persistent Dual-Layer Memory (Markdown + Vector Semantic Search) for DeepSeek Harness

### 📌 Motivation & Problem Statement

Currently, DeepSeek Harness (`dsh`) operates in a stateless paradigm. While this is great for clean reproducible execution, developers working on real-world projects encounter a persistent friction point:

- Every new session starts with a "blank slate" (cold start).
- The agent repeatedly forgets project-specific conventions (e.g., *"We use HSL colors, never Tailwind"* or *"Run unit tests with pytest-asyncio"*).
- Past debugging breakthroughs and framework workarounds are lost when the process exits, forcing the model to re-diagnose previously solved quirks.
- Simple keyword matching fails when a user's query phrasing differs from how a past solution was documented.

### 💡 Proposed Solution: `@shion-lab/dsh-plugin-memory`

We have implemented a native Cordis plugin that introduces a **Dual-Layer Memory Engine** to DeepSeek Harness:

#### Architecture Highlights:
1. **Layer 1: Human-Readable Markdown Storage (`.dsh/MEMORY.md`)**:
   Human-readable and fully Git-versionable. Team members can commit project memories to repository version control.
2. **Layer 2: Dense Vector Semantic Engine (`.dsh/memory_vectors.json`)**:
   Supports optional local Ollama (`nomic-embed-text`, `bge-m3`) or OpenAI-compatible embeddings with Cosine Similarity ranking, ensuring high-accuracy semantic recall across sessions.
3. **Automatic Contextual Recall (Pre-turn Injection)**:
   Loads and injects high-priority rules, preferences, and lessons into the agent prompt within a strict configurable character budget (avoiding context bloat).
4. **Explicit Memory Tools**:
   Exposes `remember(topic, content, category)` and `recall(query)` to the agent, allowing natural memory persistence during chat.

---

### 📦 Repository & Package

- **GitHub Repository**: [https://github.com/shion-lab/dsh-plugin-memory](https://github.com/shion-lab/dsh-plugin-memory)
- **NPM Package**: `@shion-lab/dsh-plugin-memory`

---

### 🔧 Example Usage in `cordis.yml`

```yaml
plugins:
  "@deepseek-ai/dsh": {}
  "@shion-lab/dsh-plugin-memory":
    storagePath: ".dsh/MEMORY.md"
    autoRecall: true
    embedding:
      enabled: true
      provider: "ollama" # or "openai-compatible"
      apiBase: "http://localhost:11434"
      model: "nomic-embed-text"
```

We would love to hear feedback from the DeepSeek team and community maintainers on whether this could be featured in the official plugin ecosystem / recommended list!
