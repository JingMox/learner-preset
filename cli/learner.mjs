#!/usr/bin/env node
// learner CLI(零依赖,只 import Node 内置模块 + 共享核心)。
// 用法:
//   learner query <concept>
//   learner learn <concept> --evidence "用户原话" [--level 1-5] [--domain D] [--type principle|fact|procedure]
//                           [--aliases a,b] [--prereqs a,b] [--gaps a,b] [--summary S]
//   learner review [--limit 5]
//   learner predict [--statement S] [--confidence 0.7] [--related a,b]
//                   [--id pred-1 --outcome "现实结果" --delta "差值分析"]
//   learner analogy [--target T --source S] [--divergences a,b] [--disclose a,b] [--retire]
//   learner profile [--background B] [--preferences P] [--analogies a,b]
//   learner rules        # 打印 RULES 提示词片段(供粘贴到任意客户端的自定义指令)
//   learner show         # 打印整个知识库 JSON
// 全局:
//   --kb <path>          知识库路径(优先);否则 LEARNER_KB_PATH;否则 ~/.dsh/learner/kb.json
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RULES, TOOL_SPECS, defaultKb, normalizeKb } from '../core/kb.mjs'

function parseArgs(argv) {
  const result = { positionals: [], options: {}, flags: new Set() }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--kb') {
      result.options.kb = argv[i + 1]
      i += 1
    } else if (token.startsWith('--')) {
      const eq = token.indexOf('=')
      if (eq >= 0) {
        result.options[token.slice(2, eq)] = token.slice(eq + 1)
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        result.options[token.slice(2)] = argv[i + 1]
        i += 1
      } else {
        result.flags.add(token.slice(2))
      }
    } else {
      result.positionals.push(token)
    }
  }
  return result
}

function resolveKbPath(cliOptions) {
  return cliOptions.kb || process.env.LEARNER_KB_PATH || path.join(os.homedir(), '.dsh', 'learner', 'kb.json')
}

function loadKb(kbPath) {
  try {
    return normalizeKb(JSON.parse(fs.readFileSync(kbPath, 'utf8')))
  } catch (error) {
    if (error && error.code === 'ENOENT') return defaultKb()
    throw error
  }
}

function saveKb(kbPath, kb) {
  fs.mkdirSync(path.dirname(kbPath), { recursive: true })
  fs.writeFileSync(kbPath, JSON.stringify(kb, null, 2))
}

function usage() {
  console.error('用法见文件头注释,或运行: learner rules')
  process.exit(2)
}

function main() {
  const parsed = parseArgs(process.argv.slice(2))
  const command = parsed.positionals[0]
  if (!command) usage()
  const kbPath = resolveKbPath(parsed.options)

  if (command === 'rules') {
    console.log(RULES)
    return
  }
  if (command === 'show') {
    console.log(JSON.stringify(loadKb(kbPath), null, 2))
    return
  }

  const spec = TOOL_SPECS.find((s) => s.name === 'kb_' + command)
  if (!spec) {
    console.error('未知命令: ' + command)
    usage()
  }

  const args = {}
  if (command === 'query' && parsed.positionals[1]) args.concept = parsed.positionals[1]
  if (command === 'learn' && parsed.positionals[1]) args.concept = parsed.positionals[1]
  for (const [key, value] of Object.entries(parsed.options)) {
    if (key === 'kb') continue
    args[key.replace(/-/g, '_')] = value
  }
  if (parsed.flags.has('retire')) args.retire = 'true'
  if (args.confidence != null) args.confidence = Number(args.confidence)
  if (args.level != null) args.evidence_level = Number(args.level)
  if (args.limit != null) args.limit = Number(args.limit)

  const kb = loadKb(kbPath)
  const result = spec.op(kb, args)
  const text = typeof result === 'string' ? result : result.text
  if (result && typeof result === 'object' && result.kb) saveKb(kbPath, result.kb)
  console.log(text)
}

main()
