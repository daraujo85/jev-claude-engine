# JEV Decision Engine for Claude Code — Specification

## Problem Statement

Coding agents like Claude Code, Codex CLI, and OpenCode rely primarily on generative frontier LLMs (e.g., Claude 3.5 Sonnet, Claude 3 Opus) for all micro-decisions, including routing between dozens of skills, classifying context relevance during compaction, vetting whether a proposed edit violates architectural guardrails, scoring file relevance, and deciding whether a git diff requires deep review. 

Because frontier models produce free-form natural language tokens sequentially, using them for structured decisions creates three severe bottlenecks:
1. **High Latency:** Generative token-by-token evaluation takes 2,000ms to 10,000ms per decision.
2. **Excessive Token Costs & Context Bloat:** In an environment like Diego's with over 90 skills in `~/.claude/skills/`, injecting all tool descriptions into every session eats tens of thousands of tokens per prompt.
3. **Flaky Parsing:** Generative models occasionally wrap answers in conversational filler or produce malformed JSON, requiring retry loops.

By integrating **JEV** (TypeSafe AI's System One decision model), we delegate deterministic routing, classification, guardrails, and scoring to a sub-300ms, schema-enforced decision engine ($0.04/M input tokens, zero output token charge).

---

## Goals & Measurable Success Metrics

- [ ] **M1 (Context & Token Reduction):** Cut baseline prompt overhead by ≥65% in multi-skill environments by routing prompts through JEV rather than dumping 90+ skill schemas into context.
- [ ] **M2 (Decision Latency):** Achieve sub-300ms average round-trip latency on micro-decisions (Skill Picking, Rule Enforcement, Test Coverage checks).
- [ ] **M3 (False Positive / Guardrail Precision):** Guardrail hook (Anti-Hallucination) blocks 100% of defined rule breaks with ≥80% confidence, with zero false blocks on compliant diffs.
- [ ] **M4 (Fail-Open Safety):** If JEV API is unreachable, times out (>1500ms), or returns an unhandled error, all hooks degrade gracefully to standard Claude Code behavior without crashing sessions.
- [ ] **M5 (Measurable ROI Dashboard):** Automatically calculate token savings, time saved, and approximate dollar savings per session via telemetry.

---

## Out of Scope

| Feature | Reason |
| :--- | :--- |
| Writing complex code or tests via JEV | JEV is strictly a System One decision/classification engine, not a generative code writer. Writing code remains Claude's job. |
| Replacing RTK CLI proxy | RTK already handles CLI output token reduction. JEV hooks complement RTK by handling semantic decisions. |
| Custom browser renderer engine | Browser UI testing skill interacts with existing tools (Playwright / Chrome DevTools) and delegates decision logic to JEV. |

---

## User Stories & Priority Breakdown

### P1: MVP Core (Foundational Engine, Skill Picker, Anti-Hallucination Guard, Fast Compactor)

#### Story 1.1: Core JEV Client & Gateway Provider Abstraction
**User Story:** As a developer, I want a unified JEV client that supports TypeSafe direct API, Vercel AI Gateway, OpenRouter, and an offline Mock Mode so that I can configure my credentials once and test locally without downtime.
**Why P1:** Core dependency for all 7 skills and hooks.
**Acceptance Criteria:**
1. WHEN `JEV_API_KEY` is present, THEN the client SHALL dispatch requests to `https://api.typesafe.ai/v1/systemone` (or the configured `JEV_GATEWAY_URL`).
2. WHEN `JEV_MOCK_MODE=1` is set, THEN the client SHALL return deterministic mock answers with valid probabilities without network egress.
3. WHEN a request exceeds 1500ms or fails with network errors, THEN the client SHALL return a graceful fallback status without throwing unhandled exceptions.
4. WHEN a question schema is submitted, THEN the client SHALL support `choice`, `score`, and `noul` primitives.
**Independent Test:** Run unit tests against the client with mock and real endpoints; verify typed responses for all 3 primitives.

#### Story 1.2: The Skill Picker (Hook de Roteamento - Caso 3)
**User Story:** As a developer with 90+ skills installed, I want Claude Code to consult JEV upon receiving my prompt so that only the exact relevant skill is loaded, saving thousands of tokens per prompt.
**Why P1:** Highest token savings ROI in the user's setup (Diego has ~96 skills).
**Acceptance Criteria:**
1. WHEN a user submits a prompt in Claude Code (`UserPromptSubmit` hook), THEN the hook SHALL collect available skill metadata (name + 1-line description).
2. WHEN the skill count is > 5, THEN JEV SHALL evaluate the prompt against the skill list using a `choice` primitive.
3. WHEN JEV selects a skill with confidence ≥ 0.70, THEN the hook SHALL inject a compact routing instruction into Claude's prompt context targeting that skill.
4. WHEN no skill matches (or JEV chooses "none"), THEN the hook SHALL pass the prompt through without altering context.
**Independent Test:** Submit "crie um teste unitário para o serviço de pagamento" and verify that JEV routes to testing skill in <250ms without loading unrelated marketing/video skills.

#### Story 1.3: Bloqueador Anti-Alucinação / Rule Enforcement (Hook - Caso 7)
**User Story:** As a tech lead, I want Claude Code's file modifications to be intercepted before being written to disk so that violations of project architecture or rules in `CLAUDE.md` are blocked immediately.
**Why P1:** Prevents hallucinated edits and architectural decay with zero manual oversight.
**Acceptance Criteria:**
1. WHEN Claude invokes `Write` or `Edit` on a project file (`PreToolUse` hook), THEN the hook SHALL extract the proposed changes and project rules.
2. WHEN project rules exist (e.g. `CLAUDE.md`, `.cursorrules`), THEN JEV SHALL evaluate if the diff violates any rule using a `noul` question.
3. WHEN JEV returns violation = true with confidence ≥ 0.80, THEN the hook SHALL exit with status code 2 and print the exact violated rule to stderr.
4. WHEN JEV returns violation = false or confidence < 0.80, THEN the hook SHALL exit with code 0 allowing the edit to proceed.
**Independent Test:** Attempt an edit that imports an unauthorized library or breaks a layer rule; verify exit code 2 and rejection output.

#### Story 1.4: Fast JEV Compaction (Hook - Caso 1)
**User Story:** As a developer having a long coding session, I want context compaction to be accelerated using JEV so that conversation history is pruned quickly without generating long prose summaries.
**Why P1:** Drastically accelerates sessions reaching context limits.
**Acceptance Criteria:**
1. WHEN context compaction is triggered (`PreCompact`), THEN the hook SHALL inspect current session token utilization.
2. WHEN context utilization is ≤ 25%, THEN the hook SHALL exit 0 and allow standard summarization.
3. WHEN context utilization is > 25%, THEN the hook SHALL send message blocks to JEV for binary classification (`noul`: Keep/Discard).
4. WHEN JEV classifies items, THEN the filtered context SHALL retain only critical decisions, active tasks, and code diffs.
**Independent Test:** Trigger compaction with high context; verify JEV filters discardable messages and reduces compaction latency by >60%.

---

### P2: Quality & Review Automation (Test Coverage Verifier, Code Review Pre-filter)

#### Story 2.1: Verificador de Cobertura de Testes (Hook - Caso 2)
**User Story:** As a developer modifying core business logic, I want an automatic check after editing control files so that missing automated tests are flagged before finishing the task.
**Why P2:** Enforces test discipline without consuming main model tokens.
**Acceptance Criteria:**
1. WHEN a file modification finishes (`PostToolUse`), THEN the hook SHALL check if the file matches control file patterns (e.g. `auth/`, `roles/`, `policies/`, `permissions/`).
2. WHEN a control file is modified, THEN JEV SHALL evaluate requirement/rule specifications against existing test suites using `noul` questions.
3. WHEN uncovered rules are detected, THEN the hook SHALL output a structured missing-test alert in Claude's console.
**Independent Test:** Edit a permissions file; verify JEV identifies unverified permissions and outputs a concise warning.

#### Story 2.2: Pré-Filtro de Code Review (Skill/Hook - Caso 5)
**User Story:** As a developer submitting code changes, I want a fast JEV pre-filter that checks 7 critical questions so that trivial commits are approved in 200ms and only risky changes trigger deep LLM review.
**Why P2:** Avoids firing expensive Opus/Sonnet reviews on simple formatting, docs, or straightforward edits.
**Acceptance Criteria:**
1. WHEN the code review skill is invoked (`/jev-review` or pre-commit), THEN JEV SHALL evaluate the `git diff` against 7 fixed binary questions:
   - Q1: Architecture violation?
   - Q2: Critical security or auth modification?
   - Q3: Breaking schema/API change?
   - Q4: DB migration or data loss risk?
   - Q5: Secret or credential exposure?
   - Q6: High cyclomatic/architectural complexity?
   - Q7: Missing test coverage for modified logic?
2. WHEN all 7 answers are NO, THEN the skill SHALL issue a fast PASS with zero LLM overhead.
3. WHEN ANY answer is YES or confidence is below 0.75, THEN the skill SHALL invoke Claude's deep code-review pipeline with targeted focus areas.
**Independent Test:** Run `/jev-review` on a simple comment edit (instant pass) vs an auth controller refactor (escalation to deep review).

---

### P3: Exploratory & UI Automation (Smart File Explorer, Autonomous Browser UI)

#### Story 3.1: Smart File Explorer (Skill - Caso 4)
**User Story:** As a developer exploring an unfamiliar codebase, I want JEV to score candidate files in batches of 20 so that Claude only opens the top 2-3 most relevant files.
**Why P3:** Prevents reading 30+ files sequentially when searching for concepts.
**Acceptance Criteria:**
1. WHEN the user invokes `/jev-explore <query>`, THEN the tool SHALL perform a fast file search (ripgrep/fd) returning candidate file paths.
2. WHEN candidates exceed 3, THEN the tool SHALL chunk files into batches of 20 and request JEV `score` (1-10) per file based on query relevance.
3. WHEN scores are returned, THEN only the top 3 files SHALL be passed to Claude for full inspection.
**Independent Test:** Search for "where user authentication token is refreshed" in a large repo; verify top 3 files ranked and opened.

#### Story 3.2: Autonomous Browser UI Testing (Skill - Caso 6)
**User Story:** As a developer running UI tests, I want JEV to make fast micro-decisions on which interactive DOM element to click/type next to achieve a target goal without waiting for an LLM on every step.
**Why P3:** Reduces browser test cycle from 40s down to 5s.
**Acceptance Criteria:**
1. WHEN `/jev-browser-test <goal>` is executed, THEN the skill SHALL read interactive elements (buttons, inputs, links) from the DOM.
2. WHEN the element list is extracted, THEN JEV SHALL select the next element using `choice` based on the specified goal.
3. WHEN an action is executed, THEN the loop SHALL continue until goal is reached or 10 steps maximum.
4. WHEN the loop completes, THEN Claude SHALL validate the final screen against acceptance criteria.
**Independent Test:** Run UI test to "navigate to billing and click download invoice"; verify JEV selects buttons consecutively.

---

## Non-Functional Requirements (NFRs)

1. **Latency:** JEV requests MUST execute within ≤ 300ms p95 on high-speed internet.
2. **Fail-Open Discipline:** Hooks MUST NEVER block developer workflow if an API error, rate limit, or timeout occurs. Default exit code is `0`.
3. **Security:** No API keys hardcoded. Keys resolved strictly via `JEV_API_KEY`, `OPENROUTER_API_KEY`, or `VERCEL_AI_GATEWAY_TOKEN`.
4. **Token Telemetry:** Every JEV operation logs tokens saved, latency, and cost reduction into `.jev/telemetry.jsonl` for ROI inspection.
5. **Cross-Platform Compatibility:** Runs on macOS (Darwin arm64/x64) and Linux via Node.js (≥18) and bash/zsh.
