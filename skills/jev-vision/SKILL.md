---
name: jev-vision
description: Computer Vision Bridge — descreve imagens usando um modelo de visão do 9Router (Gemini/Claude) e devolve o texto para o modelo atual. Use QUANDO o modelo em uso não suporta input de imagem (ex: DeepSeek) e o usuário manda uma imagem, screenshot, print de erro ou foto. O modelo com visão prioritiza o próprio interpretador; quando não tem, chama esta skill. Também aceita message-id do WhatsApp (baixa a mídia cheia via wpp.sh get-media) — útil quando o print/erro chegou por mensagem.
---

# /jev-vision — Ponte de Visão Computacional

Descreve imagens via modelo de visão no 9Router e devolve **texto** pro modelo que não enxerga imagem.

## Quando Usar
- O usuário cola/manda uma imagem e o modelo atual é DeepSeek (só texto).
- O print/erro chegou pelo WhatsApp (message-id) e precisa ser lido.
- Screenshot de terminal, UI, dashboard, erro de API, gráfico — qualquer coisa que exija "ler" a imagem.

## Uso
```bash
# Imagem local
node /Users/diegoaraujo/Documents/projects/jev-claude-engine/skills/jev-vision/vision.js /tmp/screenshot.png

# Imagem do WhatsApp (baixa a mídia cheia e descreve)
node .../vision.js --wpp "false_260661732970502@lid_3EB0D10AD776C206E13392"

# Prompt customizado (o que extrair da imagem)
node .../vision.js /tmp/print.png --prompt "Transcreva o erro completo e a stack trace"

# Modelo específico (default: gemini-3.8-flash do AG)
node .../vision.js /tmp/x.png --model cc/claude-sonnet-5
```

## Modelos
| Modelo | Provider | Notas |
|---|---|---|
| `ag/gemini-3.8-flash-high` | Antigravity (AG) | **default** — rápido, bom em OCR/transcrição |
| `ag/gemini-3-flash` | Antigravity (AG) | fallback 2 |
| `cc/claude-sonnet-5` | Claude | fallback 3 — excelente descrição |
| `claude-tools` | Combo | aceita imagem (rota pro sonnet/haiku) |

Se o modelo de visão falhar, tenta o próximo da lista automaticamente (failover).

## Regra de ouro
- **Se o modelo atual tem visão** → ele usa o próprio interpretador, NÃO chama esta skill.
- **Se não tem** → chama esta skill; ela devolve a descrição como texto pro modelo entender.
- A skill nunca altera o fluxo — é ponte: imagem entra, texto sai.
- Se a imagem não puder ser baixada/lida → erro claro, nunca inventar conteúdo.