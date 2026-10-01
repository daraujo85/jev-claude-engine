---
name: business-acceptance-review
description: Business Acceptance Review — garante que a entrega atende ao comportamento combinado e produz o resultado de negócio esperado. Extrai obrigações verificáveis do requisito (PRD, ticket, ADR, WhatsApp/e-mail), aponta ambiguidades, monta cenários de aceitação (BDD), inspeciona a solução, registra evidência por critério e emite parecer com matriz de rastreabilidade. Separa duas perguntas: "entregamos o comportamento?" (verificação) e "gerou o resultado de negócio?" (métricas pós-publicação). Use antes de mover tarefa para Concluída, ao revisar PR, ou quando o contexto veio de fora do repositório.
---

# /business-acceptance-review — Revisão de Aceitação de Negócio

Parecer de aceite revisável, baseado em **evidência**, não em leitura de código.

Responde **duas perguntas distintas**:
1. **Comportamento** — entregamos o comportamento combinado? (verificável agora)
2. **Resultado de negócio** — esse comportamento gerou o valor esperado? (métricas pós-publicação)

## Técnicas aplicadas
| Técnica | Papel na skill |
|---|---|
| Critérios de aceite | Cada requisito vira condições observáveis e verificáveis |
| BDD / especificação por exemplos | Cenários Dado/Quando/Então: sucesso, exceções, limites |
| ATDD | Cenários acordados servem de referência pra implementação e validação |
| Matriz de rastreabilidade | Requisito → critério → cenário → evidência → resultado |
| Tabelas de decisão | Combinações de perfil/estado/prazo quando há múltiplas condições |
| UAT | Roteiros com dados representativos pra homologação humana (não automática) |
| Revisão da jornada | Fluxo do início ao fim, incluindo integrações e efeitos persistidos |
| Métricas de resultado | Objetivo, indicador, valor inicial, meta, janela de avaliação |

## Uso
```bash
# contexto via argumento
node /Users/diegoaraujo/Documents/projects/jev-claude-engine/skills/business-acceptance-review/acceptance.js "Requisito: dois responsáveis acompanham o mesmo aluno via convite"

# contexto via arquivo (ticket exportado, PRD, transcrição)
node .../acceptance.js --context docs/ticket-gira-123.md

# contexto via stdin
cat ticket.txt | node .../acceptance.js

# entrega: base do diff (default HEAD~1 da branch atual)
node .../acceptance.js --context ticket.md --base main
```

## Fluxo da skill (7 passos)
1. **Ler a fonte do requisito** — PRD, história, ticket, regras de negócio.
2. **Extrair obrigações verificáveis** — atores, permissões, condições, ações, resultados, exceções.
3. **Apontar ambiguidades** — separar requisito explícito, hipótese e informação ausente.
4. **Montar cenários de aceitação** — caminho principal, alternativas, bloqueios, valores de fronteira.
5. **Inspecionar e executar a solução** — interface, API, persistência, integrações pertinentes.
6. **Registrar evidências por critério** — teste executado, resposta obtida, estado persistido, captura.
7. **Emitir parecer** — atendido / não atendido / parcialmente / não verificável, com matriz.

## Regras de ouro (o agente segue ao julgar)
- **Código existente não comprova comportamento funcionando.**
- **Teste passando só comprova os cenários que ele cobre.**
- **Sem evidência suficiente, o resultado é "não verificável"** — nunca assumir.
- **Critérios vêm dos requisitos**; casos adicionais propostos precisam ser identificados como tais.
- **Falha em critério obrigatório impede parecer de atendimento completo.**
- **A validação automática não se apresenta como homologação humana** (UAT é separada).
- **Resultado de negócio ainda não medido permanece pendente.**
- **DoD ≠ critérios de aceite**: DoD é o padrão de qualidade do incremento; critérios verificam o comportamento específico pedido.
- Se o requisito não define expiração/permissões/etc., **registrar a lacuna** — não inventar regra.

## Output
O script imprime: contexto, obrigações extraídas (com ambiguidades), cenários BDD, matriz de rastreabilidade
`requisito → critério → cenário → evidência → status`, e seções de parecer de comportamento + resultado de negócio.
O agente preenche evidências e status com a inspeção real da entrega.