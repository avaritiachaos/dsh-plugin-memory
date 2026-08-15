# @shion-lab/dsh-plugin-memory

[![npm version](https://img.shields.io/npm/v/@shion-lab/dsh-plugin-memory.svg)](https://www.npmjs.com/package/@shion-lab/dsh-plugin-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Persistent cross-session long-term memory and project knowledge plugin for DeepSeek Harness (`dsh`).**

---

## 🌟 Why `dsh-plugin-memory`?

By default, DeepSeek Harness operates in a **stateless** manner: once a terminal session closes, all project-specific architectural rules, user preferences, and hard-earned debugging lessons are lost.

`@shion-lab/dsh-plugin-memory` introduces a **local-first, zero-overhead long-term memory engine** to DeepSeek Harness:

- 🧠 **Cross-session Recall**: Automatically loads `.dsh/MEMORY.md` into the agent's context on startup.
- 📝 **Human-Readable & Git-Tracked**: Stores memories in clean Markdown format right inside your project repository.
- ⚡ **Explicit & Implicit Memory Tools**: The agent can explicitly `remember` user rules or `recall` past solutions.
- 🛡️ **Budget Guard**: Protects context window limits with configurable character caps.

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

Add `@shion-lab/dsh-plugin-memory` to your `cordis.yml` or load it via CLI:

```yaml
# cordis.yml
plugins:
  "@deepseek-ai/dsh": {}
  "@shion-lab/dsh-plugin-memory":
    storagePath: ".dsh/MEMORY.md"
    autoRecall: true
    maxRecallChars: 3000
```

Run DeepSeek Harness:

```bash
npx @deepseek-ai/dsh
```

---

## 🛠️ How It Works

1. When you start a task, the plugin automatically renders the contents of `.dsh/MEMORY.md` into the system prompt.
2. During the session, you can say:
   > *"Remember: Always use `pnpm` instead of `npm` for this repository, and avoid Tailwind CSS."*
3. DeepSeek calls the `remember` tool, persisting the new guideline to `.dsh/MEMORY.md`:

```markdown
## Project & User Persistent Memory

### Code Conventions & Standards
- **Package Manager**: Use pnpm instead of npm.
- **Styling**: Avoid Tailwind CSS; use Vanilla CSS modules.

### Past Lessons & Bug Fix Records
- **Vite ESM**: Fix require() error in vite.config.ts by using dynamic import().
```

---

## ⚙️ Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `storagePath` | `string` | `".dsh/MEMORY.md"` | Path to the persistent markdown file |
| `autoRecall` | `boolean` | `true` | Automatically inject memories on session start |
| `maxRecallChars` | `number` | `3000` | Character budget limit for memory injection |
| `autoReflect` | `boolean` | `true` | Enable task-end reflection summary |

---

## 📄 License

MIT © [Shion Lab](https://github.com/shion-lab)
