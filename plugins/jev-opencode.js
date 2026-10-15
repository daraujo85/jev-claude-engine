import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * JEV OpenCode plugin — TypeSafe System One decision engine.
 *
 * Mirrors the jev-claude-engine hooks for Claude Code, using OpenCode
 * plugin events:
 *   - tool.execute.before (Edit/Write)  -> anti-regression guard
 *   - experimental.session.compacting   -> fast compaction guidance
 *
 * Fail-open: any JEV error/timeout exits silently. The engine is
 * optional — no key, no behavior change.
 */

const HOOKS_DIR = "/Users/diegoaraujo/Documents/projects/jev-claude-engine/hooks";

function runHook(name, payload) {
  return new Promise((resolve) => {
    const script = join(HOOKS_DIR, name);
    if (!existsSync(script)) return resolve(null);
    const child = spawn("node", [script], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      resolve({ code, out: out.trim(), err: err.trim() });
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

export const JevPlugin = async ({ client }) => {
  return {
    // Anti-regression guard on file edits/writes.
    "tool.execute.before": async (input, output) => {
      const tool = String(input?.tool ?? "").toLowerCase();
      if (tool !== "edit" && tool !== "write" && tool !== "file.edit") return;
      const args = output?.args ?? {};
      const payload = {
        tool_name: tool,
        tool_input: {
          path: args.filePath ?? args.path ?? "",
          content: args.content ?? args.replacementContent ?? args.new_string ?? "",
        },
        cwd: process.cwd(),
      };
      try {
        const res = await runHook("jev-rule-guard.js", payload);
        if (res && res.code === 2) {
          throw new Error(`[JEV] Edit blocked: ${res.err.slice(0, 400)}`);
        }
      } catch {
        // fail-open: never block on JEV errors
      }
    },

    // Fast compaction guidance via JEV.
    "experimental.session.compacting": async (_input, output) => {
      try {
        const res = await runHook("jev-fast-compact.js", {
          context_utilization: 80,
          session_id: "opencode",
          what_triggered_compaction: "auto",
        });
        if (res && res.out) {
          const parsed = JSON.parse(res.out);
          const instructions = parsed?.hookSpecificOutput?.custom_instructions;
          if (instructions) {
            output.context.push(`## JEV Compaction Guidance\n${instructions}`);
          }
        }
      } catch {
        // fail-open
      }
    },
  };
};