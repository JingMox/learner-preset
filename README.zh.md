# learner-preset

[English](README.md) | 中文

面向 AI Agent 的第一性原理学习系统:一个知识库,三个入口(DeepSeek Harness 预设 / MCP server / CLI)。目标不是"讲得顺",而是把**判断力**传下去:

- **问题先行**:先让用户对某个场景做预测(大概率会错),再给原理;
- **深度停止**:每深挖一层前置概念前查知识库,已掌握(强度足够且未逾期)即停;
- **检验即教学**:费曼式复述与检索练习同时更新知识库、制造留存阻力;判卷采用受限执行协议(只用用户的解释解新题,缺什么在哪翻车一目了然);
- **类比生命周期**:完整给出 → 只在撞边界时拆差异 → 明确退休、切换原生词汇;
- **预测账本**:捕获"用户预测 → 现实结果 → 差值分析",差值本身就是教学内容;
- **掌握是概率不是布尔值**:证据等级 1-5(自称知道/能复述/能推导/真实用对/预测被验证),随时间衰减,过期自动进入待复习。

## 架构:一个大脑,三个入口

```
core/kb.mjs           共享纯逻辑(数据模型、匹配、衰减、六项操作、RULES)
├── kb-plugin.js      DeepSeek Harness Agent Preset(薄封装,自动注入 RULES)
├── mcp/server.mjs    MCP server(stdio;Claude Desktop、Codex CLI、Cherry Studio 等)
└── cli/learner.mjs   零依赖 CLI(给能跑 shell 的 Agent)
+ RULES.md            行为提示词片段(粘贴进任意客户端的自定义指令)
+ AGENTS.md           Codex 自动加载
```

三个入口读写**同一个**知识库(默认 `~/.dsh/learner/kb.json`,`LEARNER_KB_PATH` 可覆盖)——在一个客户端里学到的,换一个客户端接着用。

## 安装

### 入口一:DeepSeek Harness 预设

```bash
mkdir -p ~/.dsh/.agent-presets/learner
cp agent.cordis.yml kb-plugin.js preset.yml ~/.dsh/.agent-presets/learner/
cp -R core ~/.dsh/.agent-presets/learner/
```

然后新建会话时选择「第一性原理学习助手」即可,规则自动注入。

### 入口二:MCP server(Claude Desktop、Codex CLI 等)

1. 装一次依赖:`cd mcp && npm install`
2. 在客户端里注册 server:

**Claude Desktop** — 编辑 `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "learner": {
      "command": "node",
      "args": ["/绝对路径/learner-preset/mcp/server.mjs"],
      "env": { "LEARNER_KB_PATH": "/绝对路径/kb.json" }
    }
  }
}
```

**Codex CLI**:

```bash
codex mcp add learner -- node /绝对路径/learner-preset/mcp/server.mjs
```

3. 注入行为规则:把 `RULES.md` 的中文段或英文段粘贴进客户端的自定义指令(Claude:Project instructions);Codex 把 `AGENTS.md` 复制到 `~/.codex/` 即可全局生效。

### 入口三:CLI

```bash
export LEARNER_KB_PATH=/path/to/kb.json   # 可选,默认 ~/.dsh/learner/kb.json
node cli/learner.mjs query 梯度下降
node cli/learner.mjs learn 梯度下降 --evidence "用户原话" --level 2
node cli/learner.mjs review
node cli/learner.mjs predict --statement "改成批处理会更快" --confidence 0.7
node cli/learner.mjs predict --id pred-1 --outcome "实测结果" --delta "差值分析"
node cli/learner.mjs analogy --target 梯度下降 --source 导数
node cli/learner.mjs profile --background "计算机专业"
node cli/learner.mjs rules    # 打印 RULES 提示词片段
node cli/learner.mjs show     # 输出整个知识库 JSON
```

## 知识库

纯 JSON,可以自行查看、备份、编辑:

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

## 工具

三个入口暴露的工具名完全一致:

| 工具 | 作用 |
| --- | --- |
| `kb_query(concept)` | 查概念状态:【已知】/【需复习】/【未知】+ 等级、强度、缺口、前置链、类比与思维档案 |
| `kb_learn(concept, evidence, ...)` | 写入/更新知识组件(证据等级 1-5,必须带证据,gaps 记具体缺口) |
| `kb_review(limit?)` | 列出待复习组件与未对账预测(会话开始时用) |
| `kb_predict(statement? / id+outcome?)` | 预测账本:记录预测、填入现实结果与差值分析、列出未对账 |
| `kb_analogy(target, source, ...)` | 类比生命周期:投放 → 拆差异 → 退休 |
| `kb_profile(background?, preferences?, analogies?)` | 读取/更新思维档案 |

## 原理与结构

- `core/kb.mjs` 是纯逻辑、零依赖(不碰文件系统),IO 由各入口自己负责。
- `kb-plugin.js` 是薄封装(只 import Node 内置模块 + `./core/kb.mjs`);`agent.cordis.yml` 复制自内置 `standard` 预设,追加一行 `learner-kb`(`name: ./kb-plugin.js`)。
- `mcp/server.mjs` 用官方 `@modelcontextprotocol/sdk`;CLI 保持零依赖。
- MCP 传输的是工具和状态,**不是人格**:教学循环在 `RULES.md` 里(由 `scripts/gen-rules.mjs` 从 `core/kb.mjs` 生成,单一来源)。
- 掌握状态衰减是简化指数占位模型("证据等级 → 强度上限 + 半衰期 + 复习间隔"),参数待实测,可替换为知识追踪算法。

## 联系

邮箱:[l@qntx.fun](mailto:l@qntx.fun)。问题、反馈或需求,欢迎邮件或直接提 issue。

## 相关链接

- DeepSeek Harness: https://github.com/deepseek-ai/deepseek-harness
- 本仓库的 `agent.cordis.yml` 源自其 `standard` 预设(MIT)。

## License

MIT
