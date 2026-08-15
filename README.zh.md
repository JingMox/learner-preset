# learner-preset

[English](README.md) | 中文

DeepSeek Harness 的「第一性原理学习助手」Agent Preset。

在标准编码 Agent 的全部能力之上,内置一个第一性原理学习系统,目标不是"讲得顺",而是把**判断力**传下去:

- **问题先行**:先让用户对某个场景做预测(大概率会错),再给原理;
- **深度停止**:每深挖一层前置概念前查知识库,已掌握(强度足够且未逾期)即停;
- **检验即教学**:费曼式复述与检索练习同时更新知识库、制造留存阻力;判卷采用受限执行协议(只用用户的解释解新题,缺什么在哪翻车一目了然);
- **类比生命周期**:完整给出 → 只在撞边界时拆差异 → 明确退休、切换原生词汇;
- **预测账本**:捕获"用户预测 → 现实结果 → 差值分析",差值本身就是教学内容;
- **掌握是概率不是布尔值**:证据等级 1-5(自称知道/能复述/能推导/真实用对/预测被验证),随时间衰减,过期自动进入待复习。

## 安装

把三个文件放进用户预设目录:

```bash
mkdir -p ~/.dsh/.agent-presets/learner
cp agent.cordis.yml kb-plugin.js preset.yml ~/.dsh/.agent-presets/learner/
```

然后新建会话时选择「第一性原理学习助手」预设即可。

## 知识库位置

插件启动时按以下优先级决定知识库文件路径:

1. 预设配置:`agent.cordis.yml` 中给 `learner-kb` 行加 `config: { kbPath: /绝对/路径 }`;
2. 环境变量 `LEARNER_KB_PATH`;
3. 默认 `~/.dsh/learner/kb.json`(首次使用时自动创建)。

知识库是纯 JSON,可以自行查看、备份、编辑:

```json
{
  "components": [
    {
      "id": "comp-1",
      "name": "梯度下降",
      "aliases": ["gradient descent"],
      "type": "principle",
      "domain": "机器学习",
      "prerequisites": ["comp-2"],
      "mastery": {
        "strength": 0.7,
        "last_evidence": "2026-08-14T10:00:00.000Z",
        "evidence_level": 3,
        "gaps": ["能说清何时用,说不出为何在高维失效"],
        "next_review": "2026-08-18T10:00:00.000Z"
      },
      "analogies": [
        {
          "source_component": "comp-3",
          "used_at": "2026-08-14T10:00:00.000Z",
          "divergences": ["球面下山没有动量项"],
          "disclosed": [],
          "retired": false
        }
      ]
    }
  ],
  "predictions": [
    {
      "id": "pred-1",
      "statement": "用户原话:这里改成批处理性能会更好",
      "confidence": 0.7,
      "related_components": ["comp-1"],
      "made_at": "2026-08-14T10:00:00.000Z",
      "outcome": "",
      "outcome_at": null,
      "delta_analysis": ""
    }
  ],
  "profile": { "background": "……", "preferences": "……", "analogies": ["……"] }
}
```

## 使用

正常对话即可,不需要任何操作:

- 让我讲解新知识 → 按教学序列走:问题空缺 → 原理 → 类比 → 要求推导 → 拆类比 → 类比退休;
- 说「这个我会」→ 以证据等级 1(自称知道)登记,通过推导检验后升级;
- 卡住了要答案 → 立即给答案,缺口静默记录,危机过后回来补原理;
- 动手之前 → 我会请你口述"打算怎么做、为什么",并把计划记入预测账本;
- 每日/每周 → 主动对账:"当时以为会怎样,实际怎样?"差值成为教学内容;
- 想看知识库/待复习/未对账预测 → 说「看看我知识库里有什么 / 有什么要复习的」。

## 提供的工具

| 工具 | 作用 |
| --- | --- |
| `kb_query(concept)` | 查概念状态:【已知】/【需复习】/【未知】+ 等级、强度、缺口、前置链、类比与思维档案 |
| `kb_learn(concept, evidence, ...)` | 写入/更新知识组件(证据等级 1-5,必须带证据,gaps 记具体缺口) |
| `kb_review(limit?)` | 列出待复习组件与未对账预测(会话开始时用) |
| `kb_predict(statement?/id+outcome?...)` | 预测账本:记录预测、填入现实结果与差值分析、列出未对账 |
| `kb_analogy(target, source, ...)` | 类比生命周期:投放 → 拆差异 → 退休 |
| `kb_profile(background?, preferences?, analogies?)` | 读取/更新思维档案 |

## 原理与结构

- `agent.cordis.yml` 复制自 DeepSeek Harness 内置的 `standard` 预设,只改了两处:persona 增加「第一性原理导师」一句,末尾追加一行 `learner-kb`(`name: ./kb-plugin.js`)。相对路径 specifier 由 Harness 的组合加载器解析到本目录,所以这三个文件必须同目录。
- `kb-plugin.js` 零第三方依赖(只 import `node:os` / `node:path`),向 `tools` 注册表注册六个工具,并向 `systemPrompt` 贡献 `learner-rules` 讲解规则段。它不对外提供任何服务,因此不需要 `isolate` realm。
- 掌握状态衰减当前是「证据等级 → 强度上限 + 半衰期 + 复习间隔」的简化指数模型(参数待实测);后续可替换为知识追踪算法。
- 这个插件行位于 Agent Preset 平面:它只决定「这一个会话」往注册表里贡献什么;工具注册表、沙箱、审批栈等属于 Host 平面,由 Harness 提供,插件不触碰。

## 相关链接

- DeepSeek Harness: https://github.com/deepseek-ai/deepseek-harness
- 本仓库的 `agent.cordis.yml` 源自其 `standard` 预设(MIT)。

## License

MIT
