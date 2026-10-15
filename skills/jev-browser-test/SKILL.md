---
name: jev-browser-test
description: Autonomous Browser UI Navigator powered by JEV System One. Accelerates Browser Harness and Chrome DevTools with sub-300ms element selection, clicking, and semantic verification, saving 95% LLM tokens.
---

# Autonomous Browser UI Testing & Browser Harness Acceleration (JEV)

Navegação autônoma e acelerada em interfaces web integrada diretamente ao **Browser Harness** e CDP.

## Como Funciona
Normalmente o Claude ou outro agente precisa transferir árvores DOM gigantescas e fazer 5 a 10 chamadas LLM lentas (gastando ~15k tokens por passo).
Com o **JEV System One**, o loop de decisão elementar (escolher qual botão clicar ou rolar) leva apenas **150ms a 300ms**, poupando ~95% dos tokens.

## Uso no Browser Harness
Todos os comandos do `browser-harness` têm as funções de alta velocidade pré-importadas:

```bash
browser-harness <<'PY'
ensure_real_tab()
# Executa loop autônomo com decisões JEV a 200ms por clique:
jev_click_goal("Acessar notas fiscais e baixar relatório")
PY
```

### Decisão granular em um único passo:
```bash
browser-harness <<'PY'
ensure_real_tab()
step = jev_decide_click("Clicar no botão salvar alterações")
if step["element"]:
    click_at_xy(step["element"]["x"], step["element"]["y"])
PY
```

### Verificação semântica ultrarrápida:
```bash
browser-harness <<'PY'
res = jev_verify_page("O status da entrega está marcado como finalizado")
print(res["verified"], res["latency_ms"])
PY
```

## Uso via CLI ou Script
```bash
python3 /Users/diegoaraujo/Documents/projects/jev-claude-engine/skills/jev-browser-test/run-harness.py "Entrar em faturamento"
```
Ou usando o CLI global:
```bash
jev browser "Entrar em faturamento"
```
