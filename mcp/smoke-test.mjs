// learner MCP server 冒烟测试(开发用,不进 Git 发布物也可保留)。
// 拉起 server.mjs,走一遍 MCP stdio JSON-RPC:initialize → tools/list → tools/call。
// 用法: node mcp/smoke-test.mjs
import { spawn } from 'node:child_process'
import readline from 'node:readline'
import fs from 'node:fs'

const KB = '/tmp/learner-mcp-smoke-kb.json'
try { fs.unlinkSync(KB) } catch {}

const child = spawn('node', ['server.mjs'], {
  cwd: new URL('.', import.meta.url).pathname,
  env: { ...process.env, LEARNER_KB_PATH: KB },
  stdio: ['pipe', 'pipe', 'inherit'],
})

let nextId = 0
const pending = new Map()
const rl = readline.createInterface({ input: child.stdout })
rl.on('line', (line) => {
  let msg
  try { msg = JSON.parse(line) } catch { return }
  if (msg.id != null && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(JSON.stringify(msg.error)))
    else resolve(msg.result)
  }
})

function call(method, params) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
}

function assert(cond, label) {
  if (cond) console.log('PASS', label)
  else { console.error('FAIL', label); process.exitCode = 1 }
}

const init = await call('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'smoke', version: '0.0.1' },
})
assert(init && init.serverInfo && init.serverInfo.name === 'learner', 'initialize → serverInfo.name=learner')
notify('notifications/initialized', {})

const list = await call('tools/list', {})
const names = (list.tools || []).map((t) => t.name).sort()
assert(names.join(',') === 'kb_analogy,kb_learn,kb_predict,kb_profile,kb_query,kb_review', 'tools/list → 6 个工具: ' + names.join(','))

const q = await call('tools/call', { name: 'kb_query', arguments: { concept: '梯度下降' } })
const qText = (q.content || []).map((c) => c.text || '').join('')
assert(qText.includes('【未知】'), 'kb_query 空库 → 【未知】')

const l = await call('tools/call', { name: 'kb_learn', arguments: { concept: '梯度下降', evidence: 'smoke 测试', evidence_level: 2 } })
const lText = (l.content || []).map((c) => c.text || '').join('')
assert(lText.includes('【已写入】'), 'kb_learn → 写入组件')

const q2 = await call('tools/call', { name: 'kb_query', arguments: { concept: '梯度下降' } })
const q2Text = (q2.content || []).map((c) => c.text || '').join('')
assert(q2Text.includes('【已知】'), 'kb_query 写入后 → 【已知】')

const p = await call('tools/call', { name: 'kb_predict', arguments: { statement: '改成批处理性能会更好', confidence: 0.7, related: '梯度下降' } })
const pText = (p.content || []).map((c) => c.text || '').join('')
assert(pText.includes('【已记录】pred-1'), 'kb_predict → 记录 pred-1')

const r = await call('tools/call', { name: 'kb_predict', arguments: { id: 'pred-1', outcome: '实测性能反而下降', delta_analysis: '未考虑内存带宽瓶颈' } })
const rText = (r.content || []).map((c) => c.text || '').join('')
assert(rText.includes('【已对账】'), 'kb_predict → 对账')

const a = await call('tools/call', { name: 'kb_analogy', arguments: { target: '梯度下降', source: '梯度下降', retire: 'true' } })
assert(a, 'kb_analogy 调用成功(目标=源,边界场景)')

const rv = await call('tools/call', { name: 'kb_review', arguments: {} })
assert(typeof (rv.content || [])[0].text === 'string', 'kb_review → 返回文本')

const saved = JSON.parse(fs.readFileSync(KB, 'utf8'))
assert(saved.components.length === 1 && saved.predictions.length === 1 && saved.meta.version === 2, 'kb.json 落盘:1 组件 + 1 预测 + v2')

child.kill()
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE OK')
process.exit()
