---
name: jev-visual-plan
description: Planejamento visual e acompanhamento em tempo real das etapas de desenvolvimento (Planejado, Em Execução, Em Teste, Concluído) usando Archify. Gera link temporário com senha via Cloudflare Quick Tunnel sem necessidade de credenciais.
---

# /jev-visual-plan — Acompanhamento Visual de Execução (Archify + Cloudflare)

Gera um fluxo visual interativo em tempo real para as etapas de desenvolvimento, permitindo visualizar com clareza:
- **📋 Planejado**: Etapas mapeadas ainda não iniciadas.
- **⚡ Em Execução**: Etapa atualmente em desenvolvimento ativo.
- **🧪 Em Teste**: Etapa em validação, auditoria de cobertura ou QA.
- **✅ Concluído**: Etapas entregues e validadas.

Alimentado pelo motor **Archify Workflow** e integrado ao ecossistema **JEV System One**.

---

## 🌐 Compartilhamento Seguro via Cloudflare Quick Tunnel

Por padrão, a feature gera automaticamente um link temporário protegido por senha:
- **Zero Credenciais**: Utiliza o Cloudflare Quick Tunnel (`cloudflared tunnel --url`). **Não requer conta, login, token ou cadastro**.
- **Acesso Restrito**: Servidor Python local protege com tela de login, senha validada via hash SHA-256 e cookie assinado via HMAC.
- **Dependência**: Requer apenas o binário `cloudflared` instalado no sistema (`brew install cloudflared` no macOS). Caso não esteja presente, funciona localmente na porta informada.

---

## 🚀 Ciclo de Uso Durante o Desenvolvimento

### 1. Na etapa de Planejamento (Criar o Fluxo Visual)
Ao planejar uma tarefa ou especificação (Spec, Tasks, PRD):
```bash
node skills/jev-visual-plan/visual-plan.js create "Nome da Feature" tasks.md
```
*Gera o arquivo interativo `.archify/visual-plan-<slug>/plan.html` e imprime a URL e a senha de acesso.*

### 2. Ao Iniciar o Desenvolvimento de uma Etapa
```bash
node skills/jev-visual-plan/visual-plan.js update .archify/visual-plan-<slug>/candidate.json --step step_2 --status in_progress
```

### 3. Ao Entrar na Fase de Testes e Validação
```bash
node skills/jev-visual-plan/visual-plan.js update .archify/visual-plan-<slug>/candidate.json --step step_2 --status testing
```

### 4. Ao Concluir a Etapa com Sucesso
```bash
node skills/jev-visual-plan/visual-plan.js update .archify/visual-plan-<slug>/candidate.json --step step_2 --status done
```

### 5. Encerrar o Compartilhamento
```bash
node skills/jev-visual-plan/visual-plan.js stop .archify/visual-plan-<slug>/plan.html
```

---

## ⚙️ Configuração via Dashboard & ~/.jev/config.json

A feature vem **habilitada por padrão** (`enabled: true`), mas pode ser desmarcada a qualquer momento via Dashboard UI (Aba Config):
```json
{
  "skills": {
    "jev-visual-plan": {
      "enabled": true,
      "auto_share": true
    }
  }
}
```
