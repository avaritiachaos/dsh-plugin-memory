/**
 * Live Terminal Recording Script for @shion-lab/dsh-plugin-memory
 * Run: node demo.mjs
 * 
 * Simulates a realistic interactive session showing memory persistence and auto-recall.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function typeText(text, delay = 25) {
  for (const char of text) {
    process.stdout.write(char)
    await sleep(delay)
  }
  process.stdout.write('\n')
}

const cyan = (t) => `\x1b[36m${t}\x1b[0m`
const green = (t) => `\x1b[32m${t}\x1b[0m`
const yellow = (t) => `\x1b[33m${t}\x1b[0m`
const magenta = (t) => `\x1b[35m${t}\x1b[0m`
const bold = (t) => `\x1b[1m${t}\x1b[0m`
const gray = (t) => `\x1b[90m${t}\x1b[0m`

async function main() {
  console.clear()
  console.log(bold(magenta('=== DeepSeek Harness (dsh) Live Demo ===')))
  console.log(gray('Loading plugins from cordis.yml...'))
  await sleep(600)
  console.log(green('✔') + ' @deepseek-ai/dsh ' + gray('loaded'))
  console.log(green('✔') + ' @shion-lab/dsh-plugin-memory ' + cyan('[Triple-Layer Vector Memory Engine Active]'))
  console.log(gray('─'.repeat(55)))
  await sleep(800)

  console.log(bold('\n[Session #1: Training Preferences & Bug Lessons]'))
  process.stdout.write(cyan('User > '))
  await typeText('Remember: In this project, always use HSL colors, never Tailwind CSS. And test with pytest-asyncio.', 30)
  await sleep(500)

  console.log(yellow('DeepSeek > ') + 'Understood, Master! Calling memory service...')
  await sleep(400)
  console.log(gray('  ⚡ [Tool Call] remember({ topic: "Styling & Testing", category: "convention", importance: 5 })'))
  console.log(green('  ✔ Saved to .dsh/MEMORY.md and calculated 1536-dim vector embedding.'))
  await sleep(600)
  console.log(yellow('DeepSeek > ') + 'I have memorized your project conventions into persistent memory.')
  await sleep(1000)

  console.log(gray('\n... [Exiting session #1 / Terminal closed] ...'))
  await sleep(1500)

  console.log(bold('\n[Session #2: Cross-Session Automatic Recall & Zero Cold-Start]'))
  console.log(gray('Starting new session: npx @deepseek-ai/dsh'))
  await sleep(700)
  console.log(cyan('⚡ [dsh-plugin-memory] Auto-Recalling top relevant memories from .dsh/MEMORY.md...'))
  console.log(gray('  → Injected 1 active rule into system prompt (Hybrid Score: 0.94)'))
  await sleep(600)

  process.stdout.write(cyan('User > '))
  await typeText('How should I style the new user avatar card and write a test for it?', 30)
  await sleep(800)

  console.log(yellow('DeepSeek > ') + 'Based on our project memory, here is the implementation:\n')
  console.log(green('```css'))
  console.log('/* Utilizing HSL color palette per repository convention */')
  console.log('.avatar-card {')
  console.log('  background: hsl(220, 15%, 16%);')
  console.log('  border: 1px solid hsl(220, 20%, 28%);')
  console.log('  color: hsl(210, 40%, 98%);')
  console.log('}')
  console.log(green('```'))
  console.log(green('```python'))
  console.log('# Utilizing pytest-asyncio fixture')
  console.log('@pytest.mark.asyncio')
  console.log('async def test_avatar_render():')
  console.log('    assert True')
  console.log(green('```'))

  console.log(gray('─'.repeat(55)))
  console.log(bold(green('✨ Demonstration Complete! Zero Prompt Repetition.')))
}

main()
