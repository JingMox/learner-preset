# learner-preset

English | [中文](README.zh.md)

A "First-Principles Learning Assistant" Agent Preset for DeepSeek Harness.

On top of the full standard coding agent, it adds a first-principles learning system whose goal is not "smooth explanations" but transferring **judgment**:

- **Problem first**: the user predicts on a scenario (probably wrongly) before the principle is given;
- **Depth stop**: the knowledge base is queried before drilling into each prerequisite — already-mastered components (strength sufficient, review not overdue) are never re-explained;
- **Testing is teaching**: Feynman restatement and retrieval practice both update the knowledge base and create desirable difficulty; grading uses a restricted-execution protocol (solve a new problem using ONLY the user's explanation — wherever it fails is the real gap);
- **Analogy lifecycle**: give it complete → disclose divergences only at the boundary → retire it explicitly and switch to native vocabulary;
- **Prediction ledger**: capture "user prediction → real outcome → delta analysis"; the delta itself becomes teaching content;
- **Mastery is a decaying probability, not a boolean**: evidence levels 1-5 (self-reported / can restate / can derive untrained cases / used correctly in real work / prediction validated by reality), decaying over time, overdue items surface for review.

## Install

Copy the three files into the user preset directory:

```bash
mkdir -p ~/.dsh/.agent-presets/learner
cp agent.cordis.yml kb-plugin.js preset.yml ~/.dsh/.agent-presets/learner/
```

Then pick **第一性原理学习助手** when creating a session.

## Knowledge base location

At startup the plugin picks the knowledge base path in this order:

1. Preset config: add `config: { kbPath: /absolute/path }` to the `learner-kb` row in `agent.cordis.yml`;
2. Environment variable `LEARNER_KB_PATH`;
3. Default `~/.dsh/learner/kb.json` (created on first use).

The knowledge base is plain JSON — inspect, back up, or edit it freely:

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

## Usage

Just talk normally:

- Ask about new knowledge → the teaching sequence runs: problem gap → principle → analogy → required derivation → break the analogy → retire it;
- Say "I already know this" → recorded at evidence level 1 (self-report); it upgrades only through derivation checks;
- Stuck and need the answer → the answer comes immediately; the gap is recorded silently and revisited after the crisis;
- Before starting real work → you are asked to verbalize "what you plan to do and why"; the plan goes into the prediction ledger;
- Daily / weekly → reconcile predictions: "what did you expect, what actually happened?" The delta becomes teaching content;
- Want the current state → ask "what's in my knowledge base / what's due for review?".

## Tools

| Tool | Purpose |
| --- | --- |
| `kb_query(concept)` | Component status: 【已知】/【需复习】/【未知】 plus evidence level, strength, gaps, prerequisite chain, analogies, thinking profile |
| `kb_learn(concept, evidence, ...)` | Upsert a knowledge component (evidence level 1-5, evidence required, gaps = concrete deficits) |
| `kb_review(limit?)` | List due-review components and unreconciled predictions (session start) |
| `kb_predict(statement?/id+outcome?...)` | Prediction ledger: record predictions, fill in real outcomes and delta analysis, list unreconciled |
| `kb_analogy(target, source, ...)` | Analogy lifecycle: deploy → disclose divergences → retire |
| `kb_profile(background?, preferences?, analogies?)` | Read / merge-update the thinking profile |

## How it works

- `agent.cordis.yml` is copied from the DeepSeek Harness built-in `standard` preset with two changes: the persona gains one "first-principles tutor" sentence, and a `learner-kb` row (`name: ./kb-plugin.js`) is appended. Relative specifiers resolve against the composition's directory, so the three files must live together.
- `kb-plugin.js` has zero third-party dependencies (only `node:os` / `node:path`). It registers six tools into the `tools` registry and contributes the `learner-rules` prompt section to `systemPrompt`. It provides no services, so it needs no `isolate` realm.
- Mastery decay is currently a simplified exponential model ("evidence level → strength ceiling + half-life + review interval", parameters to be measured); it can later be replaced with a knowledge-tracing algorithm.
- The row lives on the Agent Preset plane: it decides only what **this session** contributes to the registries. The registries themselves, the sandbox, and the approval stack belong to the Host plane, provided by the Harness.

## Related

- DeepSeek Harness: https://github.com/deepseek-ai/deepseek-harness
- `agent.cordis.yml` derives from its `standard` preset (MIT).

## Contact

Email: [l@qntx.fun](mailto:l@qntx.fun) — questions, feedback, and issues are all welcome.

## License

MIT
