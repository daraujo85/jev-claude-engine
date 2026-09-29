# Project State — JEV Decision Engine for Claude Code

**Feature:** JEV Decision Model Integration (7 Skills & Hooks)  
**Status:** FULLY IMPLEMENTED & VALIDATED  
**Methodology:** TLC Spec-Driven Development v3.3.0  
**Target Environment:** Claude Code (CLI) on macOS (Darwin)  
**Owner:** Diego Araújo  

---

## 1. Active Phase
- [x] **Specify:** Requirements captured, EARS acceptance criteria defined, ROI metrics set (`.specs/jev-claude-engine/spec.md`).
- [x] **Design:** Architecture diagrammed, JEV protocol schemas specified, Claude Code hook/skill integration designed (`.specs/jev-claude-engine/design.md`).
- [x] **Tasks:** Granular 17-task atomic breakdown, dependency graph, test gates, granularity & diagram cross-checks validated (`.specs/jev-claude-engine/tasks.md`).
- [x] **Execute:** Full implementation of T1–T17, local mock verification, live configuration into Claude Code.
- [x] **Validate:** End-to-end evidence collection, token & latency savings benchmarking with `jev gain` (`.specs/jev-claude-engine/validation.md`).

---

## 2. Key Decisions Recorded

| Decision ID | Decision | Rationale | Impact |
| :--- | :--- | :--- | :--- |
| **DEC-001** | Multi-Provider Gateway & Key Support | Supports direct TypeSafe API, Vercel AI Gateway, OpenRouter, and automatic resolution from `~/.claude/settings.json`. | Allows immediate execution with zero configuration drift. |
| **DEC-002** | Fail-Open Hook Discipline | If JEV times out (>1500ms) or errors, hooks must exit `0` (allow) rather than breaking the developer's Claude Code session. | Claude Code never halts due to network drops or rate limits. |
| **DEC-003** | Preserving Existing Claude Code Hooks & BoltContext Removal | Removed BoltContext hook as requested, chained JEV hooks cleanly alongside `rtk-rewrite.sh` and `tts-summary.sh`. | Clean, conflict-free hook pipeline. |
| **DEC-004** | Built-in Token & Latency Telemetry (`jev gain`) | User specifically asked to audit ROI. Recorded in `.jev/telemetry.jsonl` with CLI viewer. | Auditable proof of tokens and latency reduction. |
| **DEC-005** | Hybrid Discovery Pipeline (Graphify ➔ GrepAI ➔ JEV ➔ Claude) | Combines structural graph relationships, vector search, and JEV micro-scoring before Claude reads code. | Drastically cuts token waste and finds exact target files. |
| **DEC-006** | Browser Harness Autonomous JEV Pilot | Injects `agent_helpers.py` into Browser Harness workspace to enable 150-300ms element selection, clicking, and semantic verification directly in CDP. | Turns multi-step web tests from 60s of slow LLM queries into a 2s sub-second loop. |
| **DEC-007** | On-Demand Telemetry Dashboard (`jev dashboard`) | Zero-dependency Node.js HTTP server started only on user demand. Exits cleanly with Ctrl+C, releasing 100% of memory and ports. | Zero background daemon footprint; instant visual ROI on tokens & costs. |
| **DEC-008** | Multi-Agent Universal Compatibility | Skills and rules mirrored across Claude Code, Antigravity (AGY), OpenCode, and Codex CLI. | Consistent 300ms deterministic decisions everywhere the user develops. |

---

## 3. Scope Implemented

1. **Caso 1: Fast Jev Compaction (Hook)** — `hooks/jev-fast-compact.js`
2. **Caso 2: Verificador de Cobertura de Testes (Hook)** — `hooks/jev-test-verifier.js`
3. **Caso 3: The Skill Picker (Hook de Roteamento)** — `hooks/jev-skill-picker.js`
4. **Caso 4: Smart File Explorer (Skill)** — `skills/jev-explore/`
5. **Caso 5: Pré-Filtro de Code Review (Skill/Hook)** — `skills/jev-review/`
6. **Caso 6: Browser UI Testing Autônomo & Browser Harness (Skill)** — `skills/jev-browser-test/`
7. **Caso 7: Bloqueador Anti-Alucinação (Hook)** — `hooks/jev-rule-guard.js`
8. **Extra: Hybrid Discovery Pipeline** — `skills/jev-discover/`
9. **Extra: Sentinel Anti-Regressão** — `skills/jev-anti-regression/`
10. **Extra: Bugfix Plan & Hypothesis Evaluator** — `skills/jev-plan-evaluator/`
11. **Extra: Browser Harness Acceleration** — `skills/jev-browser-test/agent_helpers.py`, `run-harness.py`
12. **Extra: On-Demand Web Dashboard** — `src/dashboard.js` (`jev dashboard` em `http://localhost:3838`)
13. **CLI Analítico:** `bin/jev.js` (`jev gain`, `jev gain --history`, `jev dashboard`, `jev browser`, `jev test`)
14. **Sessão Tmux `planner`:** Configurada e validada para uso imediato no projeto `pvax`.

