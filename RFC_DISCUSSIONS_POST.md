# [RFC / Proposal] Triple-Layer Persistent Memory (Markdown Rules + Vector Embeddings + Hybrid Vitality Ranking) for DeepSeek Harness

### 📌 Motivation & Problem Statement

Currently, DeepSeek Harness (`dsh`) operates in a stateless paradigm. While this is great for clean reproducible execution, developers working on real-world projects encounter a persistent friction point:

- Every new session starts with a "blank slate" (cold start).
- The agent repeatedly forgets project-specific conventions (e.g., *"We use HSL colors, never Tailwind"* or *"Run unit tests with pytest-asyncio"*).
- Past debugging breakthroughs and framework workarounds are lost when the process exits, forcing the model to re-diagnose previously solved quirks.
- Simple keyword matching misses synonyms, while pure vector search often suffers from fuzzy false-positives on exact symbol names.

### 💡 Proposed Solution: `@shion-lab/dsh-plugin-memory`

We have implemented a native Cordis plugin that introduces a **Triple-Layer Long-term Memory Engine** to DeepSeek Harness:

#### Architecture Highlights:
1. **Layer 1: Human-in-the-Loop Git Markdown Storage (`.dsh/MEMORY.md`)**:
   Human-readable and fully Git-versionable. Team members can commit project memories to repository version control.
2. **Layer 2: Dense Vector Semantic Engine (`.dsh/memory_store.json`)**:
   Supports optional local Ollama (`nomic-embed-text`, `bge-m3`) or OpenAI-compatible embeddings with Cosine Similarity calculation.
3. **Layer 3: Memory Vitality & Hybrid Reciprocal Ranking (RRF)**:
   - **Recency Decay**: Prioritizes fresh bug-fix discoveries over stale notes.
   - **Frequency Reinforcement**: Frequently referenced conventions gain higher activation weights.
   - **Hybrid Fusion**: Combines lexical keywords + semantic vector distances to avoid hallucinated recalls.
4. **Context Budget Guard**:
   Dynamically slices top-K memories to fit within strict character/token budgets without context bloat.

---

### 📦 Repository & Package

- **GitHub Repository**: [https://github.com/avaritiachaos/dsh-plugin-memory](https://github.com/avaritiachaos/dsh-plugin-memory)
- **NPM Package**: `@shion-lab/dsh-plugin-memory`

---

### 🔧 Example Usage in `cordis.yml`

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

We would love to hear feedback from the DeepSeek team and community maintainers on whether this could be featured in the official plugin ecosystem / recommended list!
