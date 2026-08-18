// learner 知识库插件 v2(DSH 预设入口,薄封装)。
// 全部业务逻辑在 ./core/kb.mjs(零依赖);这里只负责:
//   1. 决定知识库路径(config.kbPath → LEARNER_KB_PATH → ~/.dsh/learner/kb.json)
//   2. DSH 侧的 IO(ctx.fs 读写、shell 建目录、迁移)
//   3. 向 tools 注册表注册 6 个工具,并向 systemPrompt 贡献 learner-rules 规则段
// 不对外提供任何服务,因此不需要 isolate realm。
//
// 同一份核心还被 mcp/server.mjs 与 cli/learner.mjs 共用,三入口读写同一个知识库。

import os from 'node:os'
import path from 'node:path'
import { RULES, TOOL_SPECS, defaultKb, normalizeKb } from './core/kb.mjs'

export const name = 'learner'
export const inject = ['fs']

export function apply(ctx, config = {}) {
  const kbPath = typeof config.kbPath === 'string' && config.kbPath
    ? config.kbPath
    : (process.env.LEARNER_KB_PATH || path.join(os.homedir(), '.dsh', 'learner', 'kb.json'))
  const kbDir = path.dirname(kbPath)

  const tools = ctx.get('tools')
  const systemPrompt = ctx.get('systemPrompt')
  const shell = ctx.get('shell')

  async function loadKb() {
    const target = await ctx.fs.resolve(kbPath)
    const info = await ctx.fs.stat(target)
    if (!info) return defaultKb()
    try {
      return normalizeKb(JSON.parse(await ctx.fs.readText(target)))
    } catch (error) {
      console.error('[learner] loadKb failed:', error && error.message ? error.message : String(error))
      return defaultKb()
    }
  }

  async function saveKb(kb) {
    if (shell !== undefined) {
      try {
        const dirTarget = await ctx.fs.resolve(kbDir)
        const dirInfo = await ctx.fs.stat(dirTarget)
        if (!dirInfo) {
          const spec = shell.resolve({ command: 'mkdir -p ' + kbDir })
          await shell.run(spec)
        }
      } catch (error) {
        console.error('[learner] ensureDir failed:', error && error.message ? error.message : String(error))
      }
    }
    const target = await ctx.fs.resolve(kbPath)
    await ctx.fs.writeText(target, JSON.stringify(kb, null, 2))
  }

  for (const spec of TOOL_SPECS) {
    const properties = {}
    const required = []
    for (const [key, prop] of Object.entries(spec.properties)) {
      const { required: isRequired, ...rest } = prop
      properties[key] = rest
      if (isRequired) required.push(key)
    }
    const def = {
      name: spec.name,
      description: spec.description,
      parameters: {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
      },
      output: {
        schema: { type: 'string' },
        render(_args, value) {
          return [{ type: 'text', text: value }]
        },
      },
      async execute(args) {
        const kb = await loadKb()
        const result = spec.op(kb, args)
        const text = typeof result === 'string' ? result : result.text
        if (result && typeof result === 'object' && result.kb) await saveKb(result.kb)
        return text
      },
    }
    if (tools !== undefined) ctx.effect(() => tools.register(def))
  }
  if (systemPrompt !== undefined) {
    ctx.effect(() => systemPrompt.section({ name: 'learner-rules', order: 100, text: RULES }))
  }
}
