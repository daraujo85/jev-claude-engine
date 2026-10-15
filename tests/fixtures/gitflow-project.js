import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const GITFLOW_RULES = `# Project rules

- **Código sem comentários.** Não adicione comentários ao escrever/editar
  código. Código auto-explicativo com nomes claros.
- **Fluxo de branches (Git Flow):** a branch de trabalho nasce da \`release\`; vai pra
  \`develop\`; e volta pra \`release\`. Não commitar direto na \`release\` — toda
  alteração que chega na \`release\` entra via Pull Request. Nunca abrir PR de
  \`develop → release\` direto (fluxo: branch de trabalho → \`release\`).
  Pode commitar direto na \`develop\`.
`;

export function createGitFlowProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-gitflow-'));
  fs.mkdirSync(path.join(dir, '.git'));
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.writeFileSync(path.join(dir, '.claude', 'jev-rules.md'), GITFLOW_RULES, 'utf-8');
  fs.mkdirSync(path.join(dir, 'frontend', 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'backend'), { recursive: true });
  return dir;
}
