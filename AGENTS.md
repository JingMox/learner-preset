# learner 知识库(Codex 自动加载)

本目录/项目接入了 learner 知识库的 MCP 工具。Codex 会自动读取本文件;想全局生效,复制到 `~/.codex/AGENTS.md`。

## 工具(经 MCP 暴露,随时可调用)

- `kb_query(concept)` — 查概念是否已掌握(证据等级 1-5、强度、缺口、前置链、类比)与用户思维档案。**讲解任何新知识前、每深挖一层前置概念前必须调用**;【已知】停止深挖,【需复习】先轻量复习,【未知】才展开。
- `kb_learn(concept, evidence, evidence_level, ...)` — 写入/更新组件。每次必须带 evidence;gaps 存具体缺口。等级:1 自称知道 / 2 能复述 / 3 能推导没教过的情况 / 4 真实任务用对 / 5 预测被验证。
- `kb_review(limit?)` — 待复习组件与未对账预测(会话开始时)。
- `kb_predict(statement / id+outcome+delta_analysis)` — 预测账本:记录预测、对账现实结果、差值分析。
- `kb_analogy(target, source, divergences?, disclose?, retire?)` — 类比生命周期。
- `kb_profile(background?, preferences?, analogies?)` — 思维档案。

## 核心纪律(完整规则见 RULES.md)

1. 知识库只存「用户已掌握/正在掌握」的组件,绝不存「讲解过的内容」。
2. 讲解新原理:问题先行 → 第一性原理 → 类比 → 要求推导没教过的场景(唯一有效检验)→ 拆类比 → 类比退休。
3. 判卷用受限执行:绝不问「这个解释对不对」;只用用户解释去解新题,翻车点就是缺口。
4. 用户卡住要答案:一秒不拖,先给答案;学习动作放在危机之后。
5. 动手前请用户口述计划,记入 kb_predict;每日/每周对账"当时以为会怎样,实际怎样"。
