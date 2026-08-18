# learner-preset

English | [中文](README.zh.md)

A first-principles learning system for AI agents: one knowledge base, three entry points (DeepSeek Harness preset / MCP server / CLI). Its goal is not "smooth explanations" but transferring **judgment**:

- **Problem first**: the user predicts on a scenario (probably wrongly) before the principle is given;
- **Depth stop**: the knowledge base is queried before drilling into each prerequisite — already-mastered components (strength sufficient, review not overdue) are never re-explained;
- **Testing is teaching**: Feynman restatement and retrieval practice both update the knowledge base and create desirable difficulty; grading uses a restricted-execution protocol (solve a new problem using ONLY the user's explanation — wherever it fails is the real gap);
- **Analogy lifecycle**: give it complete → disclose divergences only at the boundary → retire it explicitly and switch to native vocabulary;
- **Prediction ledger**: capture "user prediction → real outcome → delta analysis"; the delta itself becomes teaching content;
- **Mastery is a decaying probability, not a boolean**: evidence levels 1–5 (self-reported / can restate / can derive untrained cases / used correctly in real work / prediction validated by reality), decaying over time, overdue items surface for review.

## Architecture: one brain, three entries

```
core/kb.mjs           shared pure logic (data model, matching, decay, six ops, RULES)
├── kb-plugin.js      DeepSeek Harness Agent Preset (thin wrapper; auto-injects RULES)
├── mcp/server.mjs    MCP server over stdio (Claude Desktop, Codex CLI, Cherry Studio, ...)
└── cli/learner.mjs   zero-dependency CLI (for agents that can run shell)
+ RULES.md            the behavioral prompt snippet (paste into any client's custom instructions)
+ AGENTS.md           auto-loaded by Codex
```

All three entries read and write the **same** knowledge base (default `~/.dsh/learner/kb.json`, override with `LEARNER_KB_PATH`), so what you learn in one client carries over to the others.

## Install

### Entry 1: DeepSeek Harness preset

```bash
mkdir -p ~/.dsh/.agent-presets/learner
cp agent.cordis.yml kb-plugin.js preset.yml ~/.dsh/.agent-presets/learner/
cp -R core ~/.dsh/.agent-presets/learner/
```

Then pick **第一性原理学习助手** when creating a session. Rules are injected automatically.

### Entry 2: MCP server (Claude Desktop, Codex CLI, ...)

1. Install dependencies once: `cd mcp && npm install`
2. Register the server with your client:

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "learner": {
      "command": "node",
      "args": ["/absolute/path/learner-preset/mcp/server.mjs"],
      "env": { "LEARNER_KB_PATH": "/absolute/path/kb.json" }
    }
  }
}
```

**Codex CLI**:

```bash
codex mcp add learner -- node /absolute/path/learner-preset/mcp/server.mjs
```

3. Inject the behavior: paste the Chinese or English section of `RULES.md` into the client's custom instructions (Claude: Project instructions). Codex: copy `AGENTS.md` to `~/.codex/` for global effect.

### Entry 3: CLI

```bash
export LEARNER_KB_PATH=/path/to/kb.json   # optional; default ~/.dsh/learner/kb.json
node cli/learner.mjs query 梯度下降
node cli/learner.mjs learn 梯度下降 --evidence "用户原话" --level 2
node cli/learner.mjs review
node cli/learner.mjs predict --statement "改成批处理会更快" --confidence 0.7
node cli/learner.mjs predict --id pred-1 --outcome "实测结果" --delta "差值分析"
node cli/learner.mjs analogy --target 梯度下降 --source 导数
node cli/learner.mjs profile --background "计算机专业"
node cli/learner.mjs rules    # print the RULES snippet
node cli/learner.mjs show     # dump the whole KB as JSON
```

## Knowledge base

Plain JSON — inspect, back up, or edit freely:

```json
{
  "components": [
    {
      "id": "comp-1",
      "name": "gradient descent",
      "aliases": ["梯度下降"],
      "type": "principle",
      "domain": "machine learning",
      "prerequisites": ["comp-2"],
      "mastery": {
        "strength": 0.7,
        "last_evidence": "2026-08-14T10:00:00.000Z",
        "evidence_level": 3,
        "gaps": ["knows when to use it, not why it fails in high dimensions"],
        "next_review": "2026-08-18T10:00:00.000Z"
      },
      "analogies": [
        {
          "source_component": "comp-3",
          "used_at": "2026-08-14T10:00:00.000Z",
          "divergences": ["rolling downhill on a sphere has no momentum term"],
          "disclosed": [],
          "retired": false
        }
      ]
    }
  ],
  "predictions": [
    {
      "id": "pred-1",
      "statement": "user: batching this will make it faster",
      "confidence": 0.7,
      "related_components": ["comp-1"],
      "made_at": "2026-08-14T10:00:00.000Z",
      "outcome": "",
      "outcome_at": null,
      "delta_analysis": ""
    }
  ],
  "profile": { "background": "...", "preferences": "...", "analogies": ["..."] }
}
```

## Tools

Exposed with identical names in all three entries:

| Tool | Purpose |
| --- | --- |
| `kb_query(concept)` | Component status: 【已知】/【需复习】/【未知】 plus evidence level, strength, gaps, prerequisite chain, analogies, thinking profile |
| `kb_learn(concept, evidence, ...)` | Upsert a knowledge component (evidence level 1-5, evidence required, gaps = concrete deficits) |
| `kb_review(limit?)` | List due-review components and unreconciled predictions (session start) |
| `kb_predict(statement? / id+outcome?)` | Prediction ledger: record predictions, fill in real outcomes and delta analysis, list unreconciled |
| `kb_analogy(target, source, ...)` | Analogy lifecycle: deploy → disclose divergences → retire |
| `kb_profile(background?, preferences?, analogies?)` | Read / merge-update the thinking profile |

## How it works

- `core/kb.mjs` is pure, zero-dependency logic (no fs access); each entry owns its IO.
- `kb-plugin.js` is a thin DSH preset wrapper (only Node builtins + `./core/kb.mjs`); `agent.cordis.yml` is copied from the built-in `standard` preset with a `learner-kb` row (`name: ./kb-plugin.js`).
- `mcp/server.mjs` uses the official `@modelcontextprotocol/sdk`; the CLI stays zero-dependency.
- MCP carries tools and state, **not personality**: the teaching loop lives in `RULES.md` (generated from `core/kb.mjs` by `scripts/gen-rules.mjs`).
- Mastery decay is a simplified exponential placeholder ("evidence level → strength ceiling + half-life + review interval"); parameters pending measurement, replaceable with a knowledge-tracking algorithm.

## Contact

Email: [l@qntx.fun](mailto:l@qntx.fun) — questions, feedback, and issues are all welcome.

## Related

- DeepSeek Harness: https://github.com/deepseek-ai/deepseek-harness
- `agent.cordis.yml` derives from its `standard` preset (MIT).

## License

MIT
