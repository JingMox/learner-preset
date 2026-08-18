// learner MCP server(stdio 传输)。
// 把共享核心的 6 个工具以 MCP tools 暴露给任意 MCP 客户端:
//   Claude Desktop、Cherry Studio、Cursor、Codex CLI 等。
//
// 配置示例:
//   Claude Desktop(claude_desktop_config.json):
//     "mcpServers": {
//       "learner": {
//         "command": "node",
//         "args": ["/绝对路径/learner-preset/mcp/server.mjs"],
//         "env": { "LEARNER_KB_PATH": "/绝对路径/kb.json" }   // 可选,默认 ~/.dsh/learner/kb.json
//       }
//     }
//   Codex CLI:
//     codex mcp add learner -- node /绝对路径/learner-preset/mcp/server.mjs
//
// 行为规则(RULES)不在 MCP 协议内,请把 RULES.md 的内容粘贴进客户端自定义指令
// (Codex 用 AGENTS.md,Claude 用 Project instructions)。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { TOOL_SPECS, defaultKb, normalizeKb } from '../core/kb.mjs'

const kbPath = process.env.LEARNER_KB_PATH || path.join(os.homedir(), '.dsh', 'learner', 'kb.json')

function loadKb() {
  try {
    return normalizeKb(JSON.parse(fs.readFileSync(kbPath, 'utf8')))
  } catch (error) {
    if (error && error.code === 'ENOENT') return defaultKb()
    throw error
  }
}

function saveKb(kb) {
  fs.mkdirSync(path.dirname(kbPath), { recursive: true })
  fs.writeFileSync(kbPath, JSON.stringify(kb, null, 2))
}

function toZod(prop) {
  let schema
  if (prop.type === 'integer') schema = z.number().int()
  else if (prop.type === 'number') schema = z.number()
  else schema = z.string()
  if (prop.enum) schema = schema.refine((v) => prop.enum.includes(Number(v) || v), { message: 'not in enum' })
  return schema.optional()
}

const server = new McpServer({ name: 'learner', version: '0.1.0' })

for (const spec of TOOL_SPECS) {
  const shape = {}
  for (const [key, prop] of Object.entries(spec.properties)) shape[key] = toZod(prop)
  server.registerTool(
    spec.name,
    { description: spec.description, inputSchema: shape },
    async (args) => {
      const kb = loadKb()
      const result = spec.op(kb, args)
      const text = typeof result === 'string' ? result : result.text
      if (result && typeof result === 'object' && result.kb) saveKb(result.kb)
      return { content: [{ type: 'text', text }] }
    },
  )
}

const transport = new StdioServerTransport()
await server.connect(transport)
