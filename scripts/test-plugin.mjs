// kb-plugin.js 单元冒烟:用 mock ctx 调用 apply,再逐个执行注册的工具。
// 用法: node scripts/test-plugin.mjs
import fs from 'node:fs'
import path from 'node:path'
import { apply } from '../kb-plugin.js'

const KB = '/tmp/learner-plugin-mock-kb.json'
try { fs.unlinkSync(KB) } catch {}

const registered = []
const sections = []
const ctx = {
  fs: {
    async resolve(p) { return p },
    async stat(p) { try { return fs.statSync(p) } catch { return null } },
    async readText(p) { return fs.readFileSync(p, 'utf8') },
    async writeText(p, text) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text) },
  },
  get(name) {
    if (name === 'tools') return { register(def) { registered.push(def) } }
    if (name === 'systemPrompt') return { section(entry) { sections.push(entry) } }
    return undefined
  },
  effect(fn) { fn() },
}

function assert(cond, label) {
  if (cond) console.log('PASS', label)
  else { console.error('FAIL', label); process.exitCode = 1 }
}

apply(ctx, { kbPath: KB })

assert(registered.length === 6, '注册 6 个工具')
assert(registered.map((d) => d.name).sort().join(',') === 'kb_analogy,kb_learn,kb_predict,kb_profile,kb_query,kb_review', '工具名齐全: ' + registered.map((d) => d.name).join(','))
assert(sections.length === 1 && sections[0].name === 'learner-rules' && sections[0].order === 100 && sections[0].text.includes('第一性原理学习助手规则'), 'systemPrompt 注入 learner-rules')

const byName = Object.fromEntries(registered.map((d) => [d.name, d]))

const q1 = await byName.kb_query.execute({ concept: '梯度下降' })
assert(q1.includes('【未知】'), 'kb_query 空库 → 【未知】')

const l1 = await byName.kb_learn.execute({ concept: '梯度下降', evidence: 'mock 测试', evidence_level: 2, domain: '机器学习' })
assert(l1.includes('【已写入】') && l1.includes('等级 2'), 'kb_learn 写入 → 等级 2')

const q2 = await byName.kb_query.execute({ concept: '梯度下降' })
assert(q2.includes('【已知】'), 'kb_query 写入后 → 【已知】')

const p1 = await byName.kb_predict.execute({ statement: '改成批处理会更快', confidence: 0.7, related: '梯度下降' })
assert(p1.includes('pred-1'), 'kb_predict 记录 → pred-1')
const p2 = await byName.kb_predict.execute({ id: 'pred-1', outcome: '实测反而变慢', delta_analysis: '内存带宽瓶颈' })
assert(p2.includes('【已对账】'), 'kb_predict 对账')

const a1 = await byName.kb_analogy.execute({ target: '梯度下降', source: '梯度下降', retire: 'true' })
assert(a1.includes('已退休'), 'kb_analogy 退休')

const r1 = await byName.kb_review.execute({})
assert(typeof r1 === 'string' && r1.includes('待复习'), 'kb_review 返回文本')

const pf1 = await byName.kb_profile.execute({ background: '计算机专业' })
assert(pf1.includes('计算机专业'), 'kb_profile 更新背景')

const saved = JSON.parse(fs.readFileSync(KB, 'utf8'))
assert(saved.components.length === 1 && saved.predictions.length === 1 && saved.meta.version === 2, 'kb.json 落盘:1 组件 + 1 预测 + v2')

console.log(process.exitCode ? 'PLUGIN TEST FAILED' : 'PLUGIN TEST OK')
process.exit()
