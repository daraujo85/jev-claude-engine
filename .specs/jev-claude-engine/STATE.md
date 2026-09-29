# Project State — JEV Decision Engine for Claude Code

**Feature:** JEV Decision Model Integration (7 Skills & Hooks)  
**Status:** SPECIFIED & DESIGNED (Ready for Tasks Approval & Execution)  
**Methodology:** TLC Spec-Driven Development v3.3.0  
**Target Environment:** Claude Code (CLI) on macOS (Darwin)  
**Owner:** Diego Araújo  

---

## 1. Active Phase
- [x] **Specify:** Requirements captured, EARS acceptance criteria defined, ROI metrics set (`.specs/jev-claude-engine/spec.md`).
- [x] **Design:** Architecture diagrammed, JEV protocol schemas specified, Claude Code hook/skill integration designed (`.specs/jev-claude-engine/design.md`).
- [x] **Tasks:** Granular 17-task atomic breakdown, dependency graph, test gates, granularity & diagram cross-checks validated (`.specs/jev-claude-engine/tasks.md`).
- [ ] **Execute:** Implementation of T1–T17, local mock verification, live configuration into Claude Code.
- [ ] **Validate:** End-to-end evidence collection, token & latency savings benchmarking with `jev gain`.

---

## 2. Key Decisions Recorded

| Decision ID | Decision | Rationale | Impact |
| :--- | :--- | :--- | :--- |
| **DEC-001** | Multi-Provider Gateway Abstraction | TypeSafe direct registrations are currently paused. Supporting Vercel AI Gateway and OpenRouter ensures immediate production use, while an offline Mock Provider allows local development without burning tokens. | Client automatically selects provider based on available environment variables (`JEV_API_KEY`, `VERCEL_AI_GATEWAY_TOKEN`, `OPENROUTER_API_KEY`). |
| **DEC-002** | Fail-Open Hook Discipline | If JEV times out (>1500ms) or errors, hooks must exit `0` (allow) rather than breaking the developer's Claude Code session. | Claude Code never halts due to network drops or rate limits. |
| **DEC-003** | Preserving Existing Claude Code Hooks | User already uses `rtk-rewrite.sh`, `boltcontext-posttooluse.sh`, `tts-summary.sh`, and `ai-context-bootstrap.sh`. JEV hooks will chain cleanly alongside existing hooks without overwriting or interfering with them. | Zero regression on existing RTK token-saving or BoltContext daemon workflows. |
| **DEC-004** | Built-in Token & Latency Telemetry | User specifically asked to *"ver se realmente tem um ganho interessante de velocidade e até de custo de token"*. Every JEV call logs latency and estimated token savings to `.jev/telemetry.jsonl` with an ASCII CLI viewer (`jev gain`). | Verifiable proof of ROI and latency reduction. |

---

## 3. Scope Summary (The 7 Cases)

1. **Caso 1: Fast Jev Compaction (Hook)** — Evaluates conversation turns with `noul` decisions when context > 25%, pruning history in ~1s instead of running slow LLM summarization.
2. **Caso 2: Verificador de Cobertura de Testes (Hook)** — `PostToolUse` on control files flags missing test cases for modified rules.
3. **Caso 3: The Skill Picker (Hook de Roteamento)** — `UserPromptSubmit` scans Diego's 90+ skills and selects the 1 relevant skill via JEV `choice` in <200ms, sparing ~15k-30k context tokens per prompt.
4. **Caso 4: Smart File Explorer (Skill)** — Chunks candidate files in 20s and scores relevance (1-10) with JEV `score`, opening only top 3.
5. **Caso 5: Pré-Filtro de Code Review (Skill/Hook)** — Runs 7 binary `noul` questions on git diff; grants instant fast-pass on trivial changes or routes risky diffs to deep review.
6. **Caso 6: Browser UI Testing Autônomo (Skill)** — JEV selects next interactive DOM target via `choice` in sub-second loops, delegating final semantic assertion to Claude.
7. **Caso 7: Bloqueador Anti-Alucinação (Hook)** — `PreToolUse` blocks edits violating project rules with exit code 2 and prints violation reason when confidence ≥ 80%.

---

## 4. Next Step
Present the complete TLC Spec-Driven package to Diego for review and approval to proceed with Phase 1 execution (T1–T5 foundational engine).
