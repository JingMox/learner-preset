// learner 知识库插件 v2(本地预设文件,只 import Node 内置模块)。
// 按 ai-tutor-spec.md v0.1 重构:
//   - 知识组件(KnowledgeComponent)+ 会衰减的掌握状态(证据等级 1-5)
//   - 类比生命周期:完整给出 → 拆差异(disclosed)→ 退休(retired)
//   - 预测账本:预测 → 现实结果 → 差值分析(delta)成为教学内容
// 在预设作用域内注册 kb_query / kb_learn / kb_review / kb_predict /
// kb_analogy / kb_profile 六个工具,并向 systemPrompt 贡献 learner-rules
// 讲解规则段。不对外提供任何服务,因此不需要 isolate realm。
//
// 知识库位置(取第一个命中的):
//   1. 预设配置:   - id: learner-kb / name: ./kb-plugin.js / config: { kbPath: ... }
//   2. 环境变量:   LEARNER_KB_PATH
//   3. 默认:       ~/.dsh/learner/kb.json
//
// 掌握状态衰减:v1 阶段用「证据等级 → 强度上限 + 半衰期 + 复习间隔」的简化
// 指数衰减占位(参数待实测,见 spec 未决问题 5);后续可替换为知识追踪算法。

import os from 'node:os'
import path from 'node:path'

// 证据等级 → { 强度上限, 半衰期(天), 复习间隔(天, 简化调度) }
const LEVEL_TABLE = {
  1: { ceiling: 0.3, halflife: 1, interval: 1 },
  2: { ceiling: 0.5, halflife: 2, interval: 2 },
  3: { ceiling: 0.7, halflife: 5, interval: 4 },
  4: { ceiling: 0.85, halflife: 14, interval: 7 },
  5: { ceiling: 0.95, halflife: 45, interval: 14 },
}

const RULES = [
  '# 第一性原理学习助手规则(learner v2)',
  '',
  '你是用户的第一性原理学习系统。目标不是「讲得顺」,而是把判断力传下去:让用户能用原理推导没教过的情况,并把真实工作中的预测与结果闭环转化为教学内容。',
  '',
  '## 总原则(不可违背)',
  '1. 无挫败,而非无难度:讲解要「刚好难到卡一下,但从不卡死」。不为流畅而省略推导;流畅性错觉会毁掉留存。',
  '2. 教原理,不教例子:顺序是问题先行——先让用户对一个场景做预测(大概率会预测错的那种),让问题有落点,再给原理。原理落地的唯一判据:用户能否用它推导没教过的情况。复述通过只证明记住了句子。',
  '3. 检验即教学:检验(费曼式复述、检索练习)同时完成两件事——更新知识库和制造留存阻力。检验点只落在自然停顿处:会话开始时回顾(kb_review)、用户说「我懂了」之后、用户动手之前(口述是「谨慎」不是「考试」)。绝不按固定频率打断。',
  '4. 类比纪律:类比要完整给出、不预先声明差异(免责声明会毁掉脚手架);只在用户快要撞到边界那一刻拆;只指出会导致错误预测的差异;必须有退休时刻——明确告知「从现在起用原生词汇」,然后停止翻译。',
  '5. 挂到真实工作:真实工作的唯一不可替代贡献是 ground truth。持续捕获:用户的预测 → 现实的回答 → 把差值变成教学内容(kb_predict)。',
  '6. 绝不把答案锁在测验后面:用户卡住要答案时,一秒都不拖延,先给答案;所有学习动作放在危机结束之后。',
  '',
  '## 讲解一个原理的标准流程(教学序列)',
  '1. 制造问题空缺:给一个反直觉现象/他大概率会预测错的场景,让他先给出预测。',
  '2. 给出原理:第一性原理讲解;深度停止点 = kb_query 返回【已知】的最近已掌握组件。',
  '3. 投放类比:从用户已掌握的组件中取材,完整给出,不声明差异;用 kb_analogy(target, source) 记录。',
  '4. 要求推导:给一个没教过的场景,让用户用刚学的原理推出预测。这是唯一有效的检验点。判卷用受限执行协议(见下),不要问「这个解释对不对」。',
  '5. 拆类比:用户撞到边界时(或即将撞到),指出该处的差异,用 kb_analogy(disclose) 写入。',
  '6. 类比退休:明确告知改用原生词汇,用 kb_analogy(retire) 标记。',
  '',
  '## 判卷协议(受限执行,防「判卷宽容」)',
  '模型会自动脑补用户没说的部分,把六十分的解释判成满分。所以:',
  '- 绝不问「这个解释对不对」。',
  '- 改为:只用用户的解释去解一道新题,硬约束自己不得调用解释之外的知识。缺什么,就在哪里翻车;翻车点就是真实缺口。',
  '- 翻车点用 kb_learn(gaps=...) 写入 Mastery.gaps(gaps 存「具体缺了什么」,不是百分比)。',
  '- 用户推导成功 → kb_learn(evidence_level=3);真实任务中用对 → 4;预测被现实验证 → 5。',
  '- 备选:如果用户更喜欢「教人」而非「被考」,用 protégé 模式——让用户去教一个更笨的 agent(可用 subagent),它照着执行,失败点由用户自己看见。',
  '',
  '## 掌握状态纪律(证据等级,严格不虚报)',
  '1 = 用户自称知道(最弱,人人高估自己);2 = 能复述原理(只证明记住了句子);3 = 能用原理推导没教过的情况(原理层真门槛);4 = 在真实任务中用对;5 = 预测被现实验证。',
  '用户说「我会」最多记 level 1;只有通过对应检验才升级。mastery 是会衰减的概率,不是布尔值——kb_query 返回【需复习】时,先轻量复习,不当作已掌握。',
  '',
  '## 知识库纪律',
  '- 知识库只存「用户已掌握/正在掌握」的组件,绝不存「讲解过的内容」;每次 kb_learn 必须带 evidence(用户原话或行为要点)。',
  '- 组件颗粒度:一个组件应当对应「一次可检验的推导」——没法为它设计推导题的粒度就是错的。',
  '- 深度停止:每深挖一层前置概念前先 kb_query;【已知】直接引用不展开;【需复习】快速复习再继续;【未知】才深挖展开。',
  '',
  '## 挂载真实工作(全部手工,v1 零集成)',
  '- 卡壳拦截:用户问问题要答案 → 立即给答案,一秒不拖 → 静默标记知识缺口(kb_learn 低等级 + gaps)→ 危机结束后回来补原理 → 按复习调度安排检验。',
  '- 动手前口述:用户动手前,让他说明打算怎么做、为什么这么选;把这条计划记入 kb_predict。',
  '- 预测对账:记录用户的预测(kb_predict);每日/每周一次,主动询问「当时以为会怎样,实际怎样?」;现实结果写入 outcome,差值分析写入 delta_analysis。预测被验证 → 相关组件升级 level 5;预测被推翻 → 差值本身就是教学内容。',
  '- 会话开始时:调用 kb_review 检查待复习组件与未对账预测,但只在用户愿意时开始。',
  '',
  '## 语言风格',
  '按 kb_query 返回的【思维档案】调整语言:使用用户的词汇、类比和表达习惯,把知识嚼碎后喂给用户。中文为主(知识库与用户对话语言是中文)。',
].join('\n')

function norm(value) {
  return String(value == null ? '' : value).trim().toLowerCase()
}

function splitList(value) {
  return String(value == null ? '' : value).split(/[,、;]/).map((s) => s.trim()).filter(Boolean)
}

function nowIso() {
  return new Date().toISOString()
}

function daysSince(iso) {
  if (!iso) return 0
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 0
  return Math.max(0, (Date.now() - t) / 86400000)
}

function levelOf(value) {
  const n = parseInt(value, 10)
  return Number.isFinite(n) && LEVEL_TABLE[n] ? n : 1
}

function defaultKb() {
  return {
    components: [],
    predictions: [],
    profile: { background: '', preferences: '', analogies: [] },
    meta: { version: 2 },
  }
}

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

  function migrateV1(old) {
    const kb = defaultKb()
    const now = nowIso()
    let n = 0
    for (const entry of Array.isArray(old.mastered) ? old.mastered : []) {
      if (!entry || typeof entry !== 'object') continue
      n += 1
      const cfg = LEVEL_TABLE[1]
      kb.components.push({
        id: 'comp-' + n,
        name: String(entry.concept || '').trim() || ('comp-' + n),
        aliases: Array.isArray(entry.aliases) ? entry.aliases : [],
        type: 'principle',
        domain: '',
        prerequisites: [],
        mastery: {
          strength: cfg.ceiling,
          last_evidence: now,
          evidence_level: 1,
          gaps: [],
          next_review: new Date(Date.now() + cfg.interval * 86400000).toISOString(),
        },
        analogies: [],
        created_at: now,
        summary: typeof entry.summary === 'string' ? entry.summary : '',
        evidence: Array.isArray(entry.evidence) ? entry.evidence : (entry.evidence ? [String(entry.evidence)] : []),
      })
    }
    if (old.profile && typeof old.profile === 'object') {
      kb.profile = {
        background: typeof old.profile.background === 'string' ? old.profile.background : '',
        preferences: typeof old.profile.preferences === 'string' ? old.profile.preferences : '',
        analogies: Array.isArray(old.profile.analogies) ? old.profile.analogies : [],
      }
    }
    return kb
  }

  async function loadKb() {
    const target = await ctx.fs.resolve(kbPath)
    const info = await ctx.fs.stat(target)
    if (!info) return defaultKb()
    try {
      const parsed = JSON.parse(await ctx.fs.readText(target))
      if (!parsed || typeof parsed !== 'object') return defaultKb()
      if (parsed.meta && parsed.meta.version === 2 && Array.isArray(parsed.components)) {
        const profile = parsed.profile && typeof parsed.profile === 'object' ? parsed.profile : {}
        return {
          components: parsed.components,
          predictions: Array.isArray(parsed.predictions) ? parsed.predictions : [],
          profile: {
            background: typeof profile.background === 'string' ? profile.background : '',
            preferences: typeof profile.preferences === 'string' ? profile.preferences : '',
            analogies: Array.isArray(profile.analogies) ? profile.analogies : [],
          },
          meta: { version: 2 },
        }
      }
      return migrateV1(parsed)
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

  function matchComponents(kb, concept) {
    const needle = norm(concept)
    if (!needle) return []
    const scored = []
    for (const c of kb.components) {
      if (!c || typeof c !== 'object') continue
      const name = norm(c.name)
      const aliases = Array.isArray(c.aliases) ? c.aliases.map(norm) : []
      let score = 0
      if (name === needle) score = 3
      else if (name && (name.includes(needle) || needle.includes(name))) score = 2
      else if (aliases.includes(needle)) score = 3
      else if (aliases.some((a) => a && (a.includes(needle) || needle.includes(a)))) score = 1
      if (score > 0) scored.push({ component: c, score })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.map((s) => s.component)
  }

  function effectiveStrength(component) {
    const m = component.mastery || {}
    const cfg = LEVEL_TABLE[m.evidence_level] || LEVEL_TABLE[1]
    const days = daysSince(m.last_evidence)
    const decayed = cfg.ceiling * Math.pow(0.5, days / cfg.halflife)
    return Math.max(0, Math.min(1, decayed))
  }

  function reviewStatus(component) {
    const m = component.mastery
    if (!m || !m.evidence_level) return 'unknown'
    if (m.next_review && Date.parse(m.next_review) <= Date.now()) return 'overdue'
    if (effectiveStrength(component) < 0.4) return 'weak'
    return 'known'
  }

  function nextId(list, prefix) {
    let max = 0
    for (const item of list) {
      if (item && typeof item.id === 'string' && item.id.indexOf(prefix) === 0) {
        const n = parseInt(item.id.slice(prefix.length), 10)
        if (Number.isFinite(n) && n > max) max = n
      }
    }
    return prefix + (max + 1)
  }

  function idToName(kb, id) {
    const c = kb.components.find((x) => x.id === id)
    return c ? c.name : String(id)
  }

  function resolveId(kb, name) {
    const m = matchComponents(kb, name)[0]
    return m ? m.id : String(name).trim()
  }

  function profileText(profile) {
    const parts = []
    if (profile.background) parts.push('背景: ' + profile.background)
    if (profile.preferences) parts.push('讲解偏好: ' + profile.preferences)
    if (Array.isArray(profile.analogies) && profile.analogies.length) parts.push('常用类比/词汇: ' + profile.analogies.join('、'))
    return parts.length ? parts.join(';') : '(档案为空:请按通用方式讲解,并在合适时机询问用户偏好以充实档案)'
  }

  function levelLabel(level) {
    const labels = { 1: '自称知道', 2: '能复述', 3: '能推导', 4: '真实任务用对', 5: '预测被验证' }
    return labels[level] || String(level)
  }

  function componentLine(kb, c) {
    const status = reviewStatus(c)
    const s = effectiveStrength(c)
    const m = c.mastery || {}
    const parts = [
      c.name,
      '(领域 ' + (c.domain || '未标') + ',类型 ' + (c.type || 'principle') + ',强度 ' + s.toFixed(2) + ',证据等级 ' + (m.evidence_level || 0) + '=' + levelLabel(m.evidence_level || 0) + ')',
    ]
    if (c.summary) parts.push('要点: ' + c.summary)
    if (Array.isArray(m.gaps) && m.gaps.length) parts.push('缺口: ' + m.gaps.join(';'))
    if (Array.isArray(c.prerequisites) && c.prerequisites.length) {
      parts.push('前置: ' + c.prerequisites.map((id) => idToName(kb, id)).join('、'))
    }
    const activeA = (Array.isArray(c.analogies) ? c.analogies : []).filter((a) => !a.retired)
    if (activeA.length) {
      parts.push('在用类比: ' + activeA.map((a) => idToName(kb, a.source_component)).join('、'))
    }
    return { status, text: parts.join(';') }
  }

  const textOutput = {
    schema: { type: 'string' },
    render(_args, value) {
      return [{ type: 'text', text: value }]
    },
  }

  const kbQueryDef = {
    name: 'kb_query',
    description: '查询学习知识库:概念是否已掌握(证据等级/强度/缺口/前置链/类比)与用户思维档案。第一性原理讲解开始前、每深挖一层前置概念前,都必须先调用。返回【已知】可停止深挖,【需复习】先轻量复习,【未知】才展开。',
    parameters: {
      type: 'object',
      properties: {
        concept: { type: 'string', description: '要查询的概念名(中文或英文)' },
      },
      required: ['concept'],
    },
    output: textOutput,
    async execute(args) {
      const kb = await loadKb()
      const matches = matchComponents(kb, args.concept)
      const lines = []
      if (matches.length > 0) {
        const first = componentLine(kb, matches[0])
        lines.push((first.status === 'known' ? '【已知】' : '【需复习】(' + (first.status === 'overdue' ? '复习到期' : '强度偏低') + ')') + first.text)
        if (matches.length > 1) {
          lines.push('【相关组件】' + matches.slice(1).map((c) => c.name).join('、'))
        }
      } else {
        lines.push('【未知】知识库中没有「' + args.concept + '」的组件 → 按教学序列从问题空缺开始讲,并逐层查询前置概念')
      }
      lines.push('【思维档案】' + profileText(kb.profile))
      const open = kb.predictions.filter((p) => !p.outcome).length
      lines.push('【库规模】组件 ' + kb.components.length + ' 个;未对账预测 ' + open + ' 条')
      return lines.join('\n')
    },
  }

  const kbLearnDef = {
    name: 'kb_learn',
    description: '把知识组件写入/更新知识库。证据等级 1-5:1 自称知道,2 能复述,3 能推导没教过的情况,4 真实任务用对,5 预测被验证。gaps 存具体缺了什么(逗号分隔)。每次调用必须带 evidence。',
    parameters: {
      type: 'object',
      properties: {
        concept: { type: 'string', description: '组件名(粒度:一次可检验的推导)' },
        evidence: { type: 'string', description: '证据:用户原话或行为要点,必填' },
        evidence_level: { type: 'integer', enum: [1, 2, 3, 4, 5], description: '证据等级,默认 1' },
        type: { type: 'string', enum: ['principle', 'fact', 'procedure'], description: '组件类型,默认 principle' },
        domain: { type: 'string', description: '所属领域,可选' },
        aliases: { type: 'string', description: '别名,逗号分隔,可选' },
        prerequisites: { type: 'string', description: '前置组件名,逗号分隔,可选' },
        gaps: { type: 'string', description: '具体缺口(不是百分比),逗号分隔,可选' },
        summary: { type: 'string', description: '一句话概括组件,可选' },
      },
      required: ['concept', 'evidence'],
    },
    output: textOutput,
    async execute(args) {
      const concept = String(args.concept || '').trim()
      if (!concept) return '【错误】concept 必填'
      const kb = await loadKb()
      const level = levelOf(args.evidence_level)
      const cfg = LEVEL_TABLE[level]
      const now = nowIso()
      const evidence = String(args.evidence || '').trim()
      const aliases = splitList(args.aliases)
      const prereqIds = splitList(args.prerequisites).map((n) => resolveId(kb, n))
      const gaps = splitList(args.gaps)
      const existing = matchComponents(kb, concept)[0]
      if (existing) {
        if (args.summary) existing.summary = String(args.summary)
        if (args.type) existing.type = String(args.type)
        if (args.domain) existing.domain = String(args.domain)
        if (aliases.length) existing.aliases = Array.from(new Set((Array.isArray(existing.aliases) ? existing.aliases : []).concat(aliases)))
        if (prereqIds.length) existing.prerequisites = Array.from(new Set((Array.isArray(existing.prerequisites) ? existing.prerequisites : []).concat(prereqIds)))
        const m = existing.mastery || {}
        const prevLevel = levelOf(m.evidence_level)
        const newLevel = Math.max(prevLevel, level)
        existing.mastery = {
          strength: LEVEL_TABLE[newLevel].ceiling,
          last_evidence: now,
          evidence_level: newLevel,
          gaps: Array.from(new Set((Array.isArray(m.gaps) ? m.gaps : []).concat(gaps))),
          next_review: new Date(Date.now() + LEVEL_TABLE[newLevel].interval * 86400000).toISOString(),
        }
        if (evidence && !(Array.isArray(existing.evidence) && existing.evidence.some((e) => String(e) === evidence))) {
          if (!Array.isArray(existing.evidence)) existing.evidence = []
          existing.evidence.push(evidence)
        }
        await saveKb(kb)
        return '【已更新】' + existing.name + ' 证据等级 ' + existing.mastery.evidence_level + '(' + levelLabel(existing.mastery.evidence_level) + ',强度 ' + existing.mastery.strength.toFixed(2) + ')'
      }
      kb.components.push({
        id: nextId(kb.components, 'comp-'),
        name: concept,
        aliases,
        type: args.type || 'principle',
        domain: args.domain || '',
        prerequisites: prereqIds,
        mastery: {
          strength: cfg.ceiling,
          last_evidence: now,
          evidence_level: level,
          gaps,
          next_review: new Date(Date.now() + cfg.interval * 86400000).toISOString(),
        },
        analogies: [],
        created_at: now,
        summary: args.summary ? String(args.summary) : '',
        evidence: evidence ? [evidence] : [],
      })
      await saveKb(kb)
      return '【已写入】' + concept + ' 证据等级 ' + level + '(' + levelLabel(level) + ')'
    },
  }

  const kbReviewDef = {
    name: 'kb_review',
    description: '列出待复习组件(复习到期/强度衰减)与未对账预测。用于会话开始时的回顾,或用户要求时;绝不主动打断用户。',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: '最多返回条数,默认 5' },
      },
    },
    output: textOutput,
    async execute(args) {
      const kb = await loadKb()
      const limit = Math.max(1, parseInt(args.limit, 10) || 5)
      const due = []
      for (const c of kb.components) {
        const status = reviewStatus(c)
        if (status === 'overdue' || status === 'weak') {
          due.push({ c, status, s: effectiveStrength(c) })
        }
      }
      due.sort((a, b) => (a.status === b.status ? a.s - b.s : (a.status === 'overdue' ? -1 : 1)))
      const lines = []
      if (due.length) {
        lines.push('【待复习】' + due.length + ' 个')
        for (const d of due.slice(0, limit)) {
          lines.push('- ' + d.c.name + '(等级 ' + (d.c.mastery && d.c.mastery.evidence_level) + ',强度 ' + d.s.toFixed(2) + (d.status === 'overdue' ? ',复习到期' : '') + ')缺口: ' + (Array.isArray(d.c.mastery.gaps) && d.c.mastery.gaps.length ? d.c.mastery.gaps.join(';') : '未记录'))
        }
      } else {
        lines.push('【待复习】无')
      }
      const open = kb.predictions.filter((p) => !p.outcome)
      if (open.length) {
        lines.push('【未对账预测】' + open.length + ' 条')
        for (const p of open.slice(0, limit)) {
          lines.push('- ' + p.id + ': ' + p.statement)
        }
      } else {
        lines.push('【未对账预测】无')
      }
      return lines.join('\n')
    },
  }

  const kbPredictDef = {
    name: 'kb_predict',
    description: '预测账本:记录用户预测→现实结果→差值分析。不带参数=列出未对账与最近已对账预测;statement=新建预测;id+outcome=填入现实结果(可选 delta_analysis)。预测被验证后相关组件应升级 evidence_level=5。',
    parameters: {
      type: 'object',
      properties: {
        statement: { type: 'string', description: '预测内容(用户原话),新建时必填' },
        confidence: { type: 'number', description: '用户自评信心 0-1,可选' },
        related: { type: 'string', description: '相关组件名,逗号分隔,可选' },
        id: { type: 'string', description: '预测 id(pred-N),对账时必填' },
        outcome: { type: 'string', description: '现实的结果,对账时必填' },
        delta_analysis: { type: 'string', description: '差值分析(即教学内容),可选' },
      },
    },
    output: textOutput,
    async execute(args) {
      const kb = await loadKb()
      if (args.id && args.outcome) {
        const p = kb.predictions.find((x) => x.id === String(args.id))
        if (!p) return '【错误】找不到预测 ' + args.id
        p.outcome = String(args.outcome)
        p.outcome_at = nowIso()
        if (args.delta_analysis) p.delta_analysis = String(args.delta_analysis)
        await saveKb(kb)
        return '【已对账】' + p.id + ' → ' + p.outcome
      }
      if (args.statement) {
        const p = {
          id: nextId(kb.predictions, 'pred-'),
          statement: String(args.statement),
          confidence: typeof args.confidence === 'number' ? Math.max(0, Math.min(1, args.confidence)) : null,
          related_components: splitList(args.related).map((n) => resolveId(kb, n)),
          made_at: nowIso(),
          outcome: '',
          outcome_at: null,
          delta_analysis: '',
        }
        kb.predictions.push(p)
        await saveKb(kb)
        return '【已记录】' + p.id + '(未对账 ' + kb.predictions.filter((x) => !x.outcome).length + ' 条)'
      }
      const open = kb.predictions.filter((p) => !p.outcome)
      const settled = kb.predictions.filter((p) => p.outcome).slice(-5).reverse()
      const lines = []
      lines.push('【未对账】' + open.length + ' 条')
      for (const p of open) lines.push('- ' + p.id + ' [' + (p.made_at || '').slice(0, 10) + '] ' + p.statement + (p.confidence != null ? '(信心 ' + p.confidence + ')' : ''))
      lines.push('【最近对账】')
      for (const p of settled) {
        lines.push('- ' + p.id + ': ' + p.statement + ' → 实际: ' + p.outcome + (p.delta_analysis ? ';差值: ' + p.delta_analysis : ''))
      }
      return lines.join('\n')
    },
  }

  const kbAnalogyDef = {
    name: 'kb_analogy',
    description: '类比生命周期:target+source 记录投放(完整给出,不声明差异);disclose=标记已拆开的差异;retire=true 标记退休(切换原生词汇)。不带 target=列出全部类比。source 必须取自已掌握组件。',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '目标组件名(被讲解的概念)' },
        source: { type: 'string', description: '源组件名(取自已掌握组件)' },
        divergences: { type: 'string', description: '会导致错误预测的差异,逗号分隔,可选' },
        disclose: { type: 'string', description: '已向用户拆开的差异,逗号分隔,可选' },
        retire: { type: 'string', description: "'true' 或 '1' 标记退休" },
      },
    },
    output: textOutput,
    async execute(args) {
      const kb = await loadKb()
      if (!args.target) {
        const lines = []
        for (const c of kb.components) {
          const list = Array.isArray(c.analogies) ? c.analogies : []
          for (const a of list) {
            const d = Array.isArray(a.disclosed) && a.disclosed.length ? '(已拆 ' + a.disclosed.length + ' 处)' : ''
            lines.push('- ' + c.name + ' ← ' + idToName(kb, a.source_component) + (a.retired ? '(已退休)' : d))
          }
        }
        return lines.length ? lines.join('\n') : '【类比】暂无记录'
      }
      const target = matchComponents(kb, args.target)[0]
      if (!target) return '【错误】目标组件「' + args.target + '」不在知识库中,请先 kb_learn 登记'
      const source = matchComponents(kb, args.source)[0]
      if (!source) return '【错误】源组件「' + args.source + '」不在知识库中(类比必须取自用户已掌握的组件)'
      if (!Array.isArray(target.analogies)) target.analogies = []
      let a = target.analogies.find((x) => x.source_component === source.id)
      if (!a) {
        a = { source_component: source.id, used_at: nowIso(), divergences: [], disclosed: [], retired: false }
        target.analogies.push(a)
      }
      if (args.divergences) a.divergences = Array.from(new Set((Array.isArray(a.divergences) ? a.divergences : []).concat(splitList(args.divergences))))
      if (args.disclose) a.disclosed = Array.from(new Set((Array.isArray(a.disclosed) ? a.disclosed : []).concat(splitList(args.disclose))))
      if (args.retire === 'true' || args.retire === '1') a.retired = true
      await saveKb(kb)
      return '【类比】' + target.name + ' ← ' + source.name + (a.retired ? '(已退休)' : '(差异 ' + a.divergences.length + ' 处,已拆 ' + a.disclosed.length + ' 处)')
    },
  }

  const kbProfileDef = {
    name: 'kb_profile',
    description: '读取或更新用户的思维档案(背景、讲解偏好、常用类比与词汇习惯)。不带参数=读取当前档案;带参数=合并更新。讲解时据此用「用户的语言」讲。',
    parameters: {
      type: 'object',
      properties: {
        background: { type: 'string', description: '用户背景(职业/专业/已学领域),可选' },
        preferences: { type: 'string', description: '讲解偏好(深度/节奏/是否要例子),可选' },
        analogies: { type: 'string', description: '用户常用的类比或词汇习惯,逗号分隔,可选' },
      },
    },
    output: textOutput,
    async execute(args) {
      const kb = await loadKb()
      const changed = []
      if (args.background) {
        kb.profile.background = String(args.background)
        changed.push('background')
      }
      if (args.preferences) {
        kb.profile.preferences = String(args.preferences)
        changed.push('preferences')
      }
      if (args.analogies) {
        const list = splitList(args.analogies)
        const base = Array.isArray(kb.profile.analogies) ? kb.profile.analogies : []
        kb.profile.analogies = Array.from(new Set(base.concat(list)))
        changed.push('analogies')
      }
      if (changed.length) await saveKb(kb)
      return '【思维档案】' + profileText(kb.profile) + (changed.length ? '(本次更新: ' + changed.join(',') + ')' : '')
    },
  }

  if (tools !== undefined) {
    ctx.effect(() => tools.register(kbQueryDef))
    ctx.effect(() => tools.register(kbLearnDef))
    ctx.effect(() => tools.register(kbReviewDef))
    ctx.effect(() => tools.register(kbPredictDef))
    ctx.effect(() => tools.register(kbAnalogyDef))
    ctx.effect(() => tools.register(kbProfileDef))
  }
  if (systemPrompt !== undefined) {
    ctx.effect(() => systemPrompt.section({ name: 'learner-rules', order: 100, text: RULES }))
  }
}
