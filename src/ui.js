/**
 * Terminal UI Renderer for JEV System One Decisions in Claude Code
 * Produces clean, structured visual cards with ANSI colors and diff highlights.
 */

// ANSI Color codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const BG_DARK = '\x1b[48;5;236m';

export function renderJevCard({
  feature = 'Decisão JEV',
  target = '',
  latencyMs = 120,
  confidence = 0.95,
  decision = '',
  probabilities = null,
  tokensSaved = 0,
  status = 'success',
  details = []
}) {
  const confPct = Math.round(confidence * 100);
  const confColor = confPct >= 80 ? GREEN : confPct >= 50 ? YELLOW : RED;
  const statusIcon = status === 'blocked' ? `${RED}❌ [BLOQUEIO REGRAS]${RESET}` : `${GREEN}⚡ [DECISÃO JEV]${RESET}`;

  const width = 68;
  const border = '─'.repeat(width);

  const lines = [
    `\n${CYAN}┌${border}┐${RESET}`,
    `${CYAN}│${RESET} ${BOLD}${statusIcon} ${CYAN}TypeSafe JEV System One${RESET}${' '.repeat(Math.max(0, width - 42))} ${CYAN}│${RESET}`,
    `${CYAN}│${RESET} 🎯 ${BOLD}Ação:${RESET} ${feature} ${target ? `(${target})` : ''}${' '.repeat(Math.max(0, width - 15 - feature.length - (target ? target.length + 3 : 0)))} ${CYAN}│${RESET}`,
    `${CYAN}│${RESET} ⏱️  ${BOLD}Latência:${RESET} ${latencyMs}ms  |  🔥 ${BOLD}Certeza:${RESET} ${confColor}${confPct}%${RESET}  |  💰 ${BOLD}Poupados:${RESET} ~${tokensSaved.toLocaleString()} tok${' '.repeat(Math.max(0, width - 58))} ${CYAN}│${RESET}`,
    `${CYAN}├${border}┤${RESET}`,
    `${CYAN}│${RESET} 📊 ${BOLD}Decisão:${RESET} ${GREEN}${decision}${RESET}${' '.repeat(Math.max(0, width - 14 - decision.length))} ${CYAN}│${RESET}`
  ];

  if (probabilities && typeof probabilities === 'object') {
    const probEntries = Object.entries(probabilities)
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${Math.round(v * 100)}%`)
      .join(' | ');
    lines.push(`${CYAN}│${RESET} 📈 ${DIM}Distribuição: ${probEntries}${RESET}${' '.repeat(Math.max(0, width - 17 - probEntries.length))} ${CYAN}│${RESET}`);
  }

  for (const d of details) {
    const cleanD = d.slice(0, width - 6);
    lines.push(`${CYAN}│${RESET}   ${cleanD}${' '.repeat(Math.max(0, width - 4 - cleanD.length))} ${CYAN}│${RESET}`);
  }

  lines.push(`${CYAN}└${border}┘${RESET}\n`);

  return lines.join('\n');
}

export function renderDiffCard({ filePath, ruleViolated, confidence = 0.95, diffSnippet = '' }) {
  const width = 68;
  const border = '─'.repeat(width);
  const confPct = Math.round(confidence * 100);

  const lines = [
    `\n${RED}┌${border}┐${RESET}`,
    `${RED}│${RESET} ❌ ${BOLD}${RED}JEV GUARD BLOQUEIO AUTOMÁTICO ANTI-ALUCINAÇÃO${RESET}${' '.repeat(Math.max(0, width - 47))} ${RED}│${RESET}`,
    `${RED}│${RESET} 📁 ${BOLD}Arquivo:${RESET} ${filePath}${' '.repeat(Math.max(0, width - 13 - filePath.length))} ${RED}│${RESET}`,
    `${RED}│${RESET} 🚨 ${BOLD}Regra Violada:${RESET} ${YELLOW}${ruleViolated.slice(0, width - 20)}${RESET}${' '.repeat(Math.max(0, width - 19 - ruleViolated.slice(0, width - 20).length))} ${RED}│${RESET}`,
    `${RED}│${RESET} 🔥 ${BOLD}Certeza do JEV:${RESET} ${RED}${confPct}%${RESET} (Edição rejeitada com exit code 2)${' '.repeat(Math.max(0, width - 55))} ${RED}│${RESET}`,
    `${RED}├${border}┤${RESET}`
  ];

  if (diffSnippet) {
    const snippetLines = diffSnippet.split('\n').slice(0, 4);
    for (const s of snippetLines) {
      const isAdd = s.startsWith('+');
      const isDel = s.startsWith('-');
      const color = isAdd ? GREEN : isDel ? RED : DIM;
      const cleanS = s.slice(0, width - 6);
      lines.push(`${RED}│${RESET} ${color}${cleanS}${RESET}${' '.repeat(Math.max(0, width - 3 - cleanS.length))} ${RED}│${RESET}`);
    }
  }

  lines.push(`${RED}│${RESET} ${DIM}Ação requerida: Corrija o código antes de tentar salvar novamente.${RESET}${' '.repeat(Math.max(0, width - 68))} ${RED}│${RESET}`);
  lines.push(`${RED}└${border}┘${RESET}\n`);

  return lines.join('\n');
}

export function renderPrCard({ head, base, allowed, reason = '', message = '' }) {
  const width = 68;
  const border = '─'.repeat(width);
  const color = allowed ? GREEN : RED;
  const statusIcon = allowed ? `${GREEN}✅ [JEV PR GUARD PERMITIDO]${RESET}` : `${RED}🛑 [JEV PR GUARD BLOQUEADO]${RESET}`;

  const lines = [
    `\n${color}┌${border}┐${RESET}`,
    `${color}│${RESET} ${BOLD}${statusIcon}${RESET}${' '.repeat(Math.max(0, width - 30))} ${color}│${RESET}`,
    `${color}│${RESET} 🔀 ${BOLD}Branches:${RESET} ${CYAN}${head}${RESET} → ${MAGENTA}${base}${RESET}${' '.repeat(Math.max(0, width - 15 - head.length - base.length))} ${color}│${RESET}`
  ];

  if (!allowed) {
    lines.push(`${color}├${border}┤${RESET}`);
    lines.push(`${color}│${RESET} ⚠️  ${BOLD}Motivo:${RESET} ${YELLOW}${reason.slice(0, width - 13)}${RESET}${' '.repeat(Math.max(0, width - 12 - reason.slice(0, width - 13).length))} ${color}│${RESET}`);

    // Message snippet lines
    const msgLines = message.split('\n').filter(Boolean).slice(0, 5);
    for (const m of msgLines) {
      const cleanM = m.replace(/[\x1b]\[[0-9;]*m/g, '').slice(0, width - 6);
      lines.push(`${color}│${RESET}   ${cleanM}${' '.repeat(Math.max(0, width - 4 - cleanM.length))} ${color}│${RESET}`);
    }
  }

  lines.push(`${color}└${border}┘${RESET}\n`);
  return lines.join('\n');
}
