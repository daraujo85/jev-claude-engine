---
name: browser-harness
description: "Browser Harness acelerado por JEV System One. Navegação web direta via CDP, automação de testes de UI e scraping com decisões em sub-300ms, poupando 95% de tokens de LLM."
---

# ⚡ Browser Harness (JEV System One Accelerated)

Controle direto do navegador via CDP (Chrome DevTools Protocol), superalimentado pelo motor de decisão em sub-300ms **JEV System One (TypeSafe AI)**.

---

## 🚀 Como Funciona a Aceleração JEV

Em navegadores controlados por agentes normais, inspecionar a árvore de acessibilidade (AX Tree) ou capturar prints a cada passo consome de 15.000 a 40.000 tokens e adiciona de 5 a 10 segundos de espera por clique.

Com o **JEV System One**:
1. O **Browser Harness** extrai os nós interativos visíveis (botões, links, inputs).
2. O **JEV** seleciona o elemento exato em **~180ms - 250ms** com a primitiva `choice`.
3. O clique por coordenadas `click_at_xy(x, y)` ou preenchimento ocorre imediatamente direto no compositor CDP.
4. O loop inteiro roda localmente sem sobrecarregar o contexto do Claude, retornando apenas o resultado final verificado.

---

## 🛠️ Uso Rápido (JEV Fast Mode)

Todos os comandos `browser-harness` carregam automaticamente as funções do JEV:

### 1. Loop Autônomo com Decisões JEV em Milissegundos
```bash
browser-harness <<'PY'
ensure_real_tab()
# Navega autonomamente até o objetivo tomando decisões a cada 200ms:
jev_click_goal("Entrar em faturamento e baixar extrato em PDF")
PY
```

### 2. Pesquisa e Seleção de Vídeo/Item em 1 Passo
```bash
browser-harness <<'PY'
ensure_real_tab()
jev_fast_search("https://www.youtube.com", "Google DeepMind", click_first=True)
PY
```

### 3. Decisão de Clique Granular
```bash
browser-harness <<'PY'
ensure_real_tab()
step = jev_decide_click("Clicar no botão salvar alterações")
if step["element"]:
    click_at_xy(step["element"]["x"], step["element"]["y"])
PY
```

### 4. Validação Semântica Rápida
```bash
browser-harness <<'PY'
res = jev_verify_page("O vídeo está em reprodução e o título contém DeepMind")
print(res["verified"], res["latency_ms"])
PY
```

---

## 💻 Uso via CLI (Pilot Autônomo)

```bash
# Executar tarefa rápida no YouTube
python3 /Users/diegoaraujo/Documents/projects/jev-claude-engine/skills/browser-harness/pilot.py --url "https://www.youtube.com" --search "Google DeepMind" --click-first

# Executar benchmark comparativo (Com JEV vs Sem JEV)
python3 /Users/diegoaraujo/Documents/projects/jev-claude-engine/skills/browser-harness/pilot.py --benchmark-youtube
```

---

## 🌐 Recursos Padrão do Browser Harness

O Browser Harness continua oferecendo todas as capacidades avançadas de CDP:

- **Abas:**
  - `new_tab("https://example.com")`: Abre aba sem perder a atual.
  - `activate_tab(target)`: Foca a aba no Chrome.
  - `close_tab(target)`: Fecha a aba.
- **Diagnóstico do Chrome:**
  - `browser-harness --doctor`
  - macOS: `browser-harness mac-approve` para autorizar conexão remota de depuração.
- **Nuvem (Browser Use Cloud):**
  - `browser-harness auth login`
  - `start_remote_daemon("sessao1")`
- **Gravações em Vídeo:**
  - `browser-harness recordings enable`
  - `start_recording("tarefa")` / `stop_recording()`
