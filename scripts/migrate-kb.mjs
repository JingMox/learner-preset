// 一次性迁移脚本:把知识库文件规范化/迁移到 v2 并落盘。
// 用法: node scripts/migrate-kb.mjs [kb路径](默认 LEARNER_KB_PATH 或 ~/.dsh/learner/kb.json)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defaultKb, normalizeKb } from '../core/kb.mjs'

const kbPath = process.argv[2] || process.env.LEARNER_KB_PATH || path.join(os.homedir(), '.dsh', 'learner', 'kb.json')
let kb
try {
  kb = normalizeKb(JSON.parse(fs.readFileSync(kbPath, 'utf8')))
} catch (error) {
  if (error && error.code === 'ENOENT') kb = defaultKb()
  else throw error
}
fs.mkdirSync(path.dirname(kbPath), { recursive: true })
fs.writeFileSync(kbPath, JSON.stringify(kb, null, 2))
console.log('已迁移: ' + kb.components.length + ' 组件;' + kb.predictions.length + ' 预测;version ' + kb.meta.version + ' → ' + kbPath)
