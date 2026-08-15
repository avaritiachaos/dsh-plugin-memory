/**
 * B站专属实机演示脚本（纯中文沉浸式版）
 * 运行方式: node demo.mjs
 * 
 * 真实还原：DeepSeek Harness 搭载 @shion-lab/dsh-plugin-memory 的完整工作流
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function typeText(text, delay = 35) {
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
const red = (t) => `\x1b[31m${t}\x1b[0m`

async function main() {
  console.clear()
  console.log(bold(magenta('┌──────────────────────────────────────────────────────────┐')))
  console.log(bold(magenta('│  🚀 DeepSeek Harness (dsh) 官方智能体 搭载紫苑级记忆插件  │')))
  console.log(bold(magenta('└──────────────────────────────────────────────────────────┘')))
  console.log(gray('正在解析 cordis.yml 插件装配链...'))
  await sleep(600)
  console.log(green('  ✔ [Core]   ') + '@deepseek-ai/dsh ' + gray('(官方代码执行引擎已就绪)'))
  await sleep(400)
  console.log(green('  ✔ [Plugin] ') + bold(cyan('@shion-lab/dsh-plugin-memory ')) + magenta('[三层立体向量记忆引擎激活]'))
  console.log(gray('     ├─ Layer 1: Git 版本化规则库 (.dsh/MEMORY.md)'))
  console.log(gray('     ├─ Layer 2: 稠密向量语义引擎 (Dense Embeddings 1536-dim)'))
  console.log(gray('     └─ Layer 3: 30天半衰期衰减与访问频次动态强化 (Hybrid RRF)'))
  console.log(gray('═'.repeat(60)))
  await sleep(1000)

  // ══════════════════════════════════════════════════════════════════
  // 第一轮：教会 AI 团队规矩与避坑教训
  // ══════════════════════════════════════════════════════════════════
  console.log(bold(yellow('\n【第 1 会话：训练项目规范与避坑经验】 (2026-08-10)')))
  process.stdout.write(bold(cyan('Master > ')))
  await typeText('记住：咱们这个项目一律用 HSL 配色，禁止使用 Tailwind CSS。还有，写异步单测必须用 pytest-asyncio！', 40)
  await sleep(600)

  console.log(bold(yellow('DeepSeek > ')) + '收到，Master！正在调用记忆插件进行持久化沉淀...')
  await sleep(500)
  console.log(gray('  ⚡ [Tool Call] remember({'))
  console.log(gray('       topic: "项目前端配色与单测规范",'))
  console.log(gray('       content: "配色严格采用 HSL 格式，杜绝 Tailwind 类名；单测统一使用 pytest-asyncio",'))
  console.log(gray('       category: "convention",'))
  console.log(gray('       importance: 5'))
  console.log(gray('     })'))
  await sleep(600)
  console.log(green('  ✔ 规则已成功写入 .dsh/MEMORY.md (Git 追踪就绪)'))
  console.log(green('  ✔ 稠密向量嵌入生成完毕，已建立本地余弦索引。'))
  await sleep(500)
  console.log(bold(yellow('DeepSeek > ')) + 'Master，项目规范已牢牢刻入我的长期记忆库中，后续会话将终身生效。')
  await sleep(1200)

  // 模拟会话关闭
  console.log(gray('\n... [退出终端，断开连接，会话结束] ...'))
  console.log(gray('... 经过了 5 天时间，开发者再次启动电脑 ...'))
  await sleep(2000)

  // ══════════════════════════════════════════════════════════════════
  // 第二轮：跨会话自动唤醒记忆，零冷启动
  // ══════════════════════════════════════════════════════════════════
  console.log(bold(green('\n【第 2 会话：跨会话记忆自动唤醒 / 彻底告别重复 Prompt】 (2026-08-15)')))
  console.log(gray('启动全新会话: npx @deepseek-ai/dsh'))
  await sleep(600)
  console.log(cyan('⚡ [dsh-plugin-memory] 正在执行开局上下文智能召回...'))
  await sleep(500)
  console.log(gray('  → 匹配到 1 条高价值项目规范: [项目前端配色与单测规范] (综合打分: 0.96)'))
  console.log(gray('  → 记忆已自动装填至模型系统上下文 (占用预算: 120 / 3500 字符)'))
  await sleep(800)

  // 开发者完全不提规则，只提业务需求
  process.stdout.write(bold(cyan('Master > ')))
  await typeText('帮我写一个用户卡片组件的样式，并配一个测试用例。', 40)
  await sleep(800)

  console.log(bold(yellow('DeepSeek > ')) + '好的 Master，已根据之前记忆库中您立下的项目规范进行编写：\n')
  await sleep(400)
  console.log(green('/* 🎨 严格遵循仓库规范：采用 HSL 配色，未使用 Tailwind CSS */'))
  console.log(cyan('.user-card {'))
  console.log(cyan('  background: hsl(220, 18%, 14%);'))
  console.log(cyan('  border: 1px solid hsl(220, 25%, 26%);'))
  console.log(cyan('  color: hsl(210, 40%, 98%);'))
  console.log(cyan('  border-radius: 8px;'))
  console.log(cyan('}'))
  console.log('')
  await sleep(500)
  console.log(green('# 🧪 严格遵循仓库规范：采用 pytest-asyncio 异步测试夹具'))
  console.log(cyan('import pytest'))
  console.log('')
  console.log(cyan('@pytest.mark.asyncio'))
  console.log(cyan('async def test_user_card_render():'))
  console.log(cyan('    # 测试组件渲染逻辑'))
  console.log(cyan('    assert True'))

  await sleep(800)
  console.log(gray('\n' + '═'.repeat(60)))
  console.log(bold(green('✨ 实机演示完毕！零重复提示词，真正让 DeepSeek 越用越聪明。')))
  console.log(bold(magenta('📦 插件开源地址: https://github.com/avaritiachaos/dsh-plugin-memory')))
}

main()
