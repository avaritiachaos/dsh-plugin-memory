# [RFC / Proposal] Persistent Cross-Session Memory & Project Knowledge Plugin for DeepSeek Harness

### 📌 Motivation & Problem Statement

Currently, DeepSeek Harness (`dsh`) operates in a stateless paradigm. While this is great for clean reproducible execution, developers working on real-world projects encounter a persistent friction point:

- Every new session starts with a "blank slate" (cold start).
- The agent repeatedly forgets project-specific conventions (e.g., *"We use HSL colors, never Tailwind"* or *"Run unit tests with pytest-asyncio"*).
- Past debugging breakthroughs and framework workarounds are lost when the process exits, forcing the model to re-diagnose previously solved quirks.

### 💡 Proposed Solution: `@shion-lab/dsh-plugin-memory`

We have implemented a native Cordis plugin that introduces **local-first, persistent cross-session memory** to DeepSeek Harness without breaking any existing sandbox or headless workflows.

#### Key Features:
1. **Zero-dep Local Markdown Storage (`.dsh/MEMORY.md`)**:
   Human-readable and fully Git-versionable. Team members can commit project memories to repository version control.
2. **Automatic Contextual Recall (Pre-turn Injection)**:
   Loads and injects high-priority rules, preferences, and lessons into the agent prompt within a strict configurable character budget (avoiding context bloat).
3. **Explicit Memory Tools**:
   Exposes `remember(topic, content, category)` and `recall(query)` to the agent, allowing natural memory persistence during chat.
4. **Post-Task Reflection**:
   Optionally synthesizes actionable learnings when complex coding tasks succeed.

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
    maxRecallChars: 3000
```

We would love to hear feedback from the DeepSeek team and community maintainers on whether this could be featured in the official plugin ecosystem / recommended list!
