---
name: jev-diagram
description: Gera diagramas interativos de arquitetura, workflow, sequence, dataflow e lifecycle em HTML/SVG standalone com qualidade visual Showcase via Archify CLI. Use quando o usuário pedir "gera um diagrama", "desenha a arquitetura", "mapeia o fluxo", "cria um diagrama de sequência", "workflow da feature", "converte mermaid", ou para documentar sistemas e processos.
---

# /jev-diagram — Gerador de Diagramas Interativos (Archify + JEV)

Gera diagramas autônomos, polidos e interativos em **HTML standalone com SVG inline**, suporte nativo a temas Claro/Escuro, zoom/pan interativo, animação de trace e exportação para SVG/PNG/WebM.

Alimentado pelo motor **Archify CLI** e integrado ao ecossistema **JEV System One**.

---

## 1. Tipos de Diagramas Suportados

| Tipo | Quando Usar | Exemplos de Aplicação |
|---|---|---|
| `architecture` | Componentes, serviços, microserviços, cloud, boundaries de segurança/rede, filas e bancos | Mapeamento de repositórios, infraestrutura AWS/GCP, topologia de microsserviços |
| `workflow` | Processos operacionais, esteiras de negócio, aprovações, runbooks, wizards multi-etapas | Jornada do tomador, wizard de 5 etapas, esteira de crédito, onboarding |
| `sequence` | Chamadas de API, ciclos de requisição/resposta, tracing síncrono/assíncrono | Fluxo de autenticação OAuth2, webhook callbacks, checkout de pagamento |
| `dataflow` | Pipelines de dados, ETL/ELT, lineage, governança e destinos de dados | Ingestão de telemetria, conciliação bancária, fluxo de documentos |
| `lifecycle` | Máquinas de estados, status de pedidos, ciclos de vida de entidades | Status de proposta (rascunho → em análise → aprovado → liquidado) |

---

## 2. Fluxo Rápido de Criação (Fast Authoring Path)

1. **Escolha o tipo** conforme o objetivo (`architecture` ou `workflow` cobrem 85% dos casos).
2. **Crie a pasta da sessão**: `.archify/<type>-<slug>-<timestamp>/` no diretório de trabalho.
3. **Gere o `candidate.json`** com os nós, conexões e cards explicativos:
   * Ou use o scaffold:
     ```bash
     node /Users/diegoaraujo/Documents/projects/jev-claude-engine/skills/jev-diagram/diagram.js scaffold <tipo>
     ```
4. **Compile e valide com os 4 Gates de Qualidade (Showcase)**:
   ```bash
   archify finalize <type> candidate.json output.html --quality showcase --json
   ```
   *Ou via script auxiliar:*
   ```bash
   node /Users/diegoaraujo/Documents/projects/jev-claude-engine/skills/jev-diagram/diagram.js finalize <type> candidate.json output.html
   ```
5. **Entregue o arquivo HTML**: O resultado é um arquivo HTML autônomo com zero dependências externas em tempo de execução.

---

## 3. Regras de Ouro de Layout & Tipografia (Boas Práticas Archify)

Para garantir aprovação imediata nos gates sem erros de legibilidade ou viewport:

1. **Sublabels Concisos**:
   * O Archify valida tipografia em 1440x900 e exige que o texto projetado seja $\ge 6\text{px}$.
   * Use sublabels curtos e objetivos (ex: `"Node / REST"`, `"Wizard 5 Passos"`, `"Parcela D-3"`).
   * Evite frases longas dentro dos nós; coloque detalhes ricos nos **cards** inferiores.

2. **Espaçamento para Rótulos de Conexão (`clear gap`)**:
   * Se uma conexão tem texto (ex: `"enfileira trigger"`), a distância livre entre as caixas deve ser de pelo menos **108px a 120px**.
   * Entre colunas de componentes em arquitetura, use passos horizontais confortáveis (ex: $x = 40, 285, 530, 775, 1025$).

3. **Workflow — Limite de Raias (`lanes`)**:
   * No modo `workflow`, mantenha preferencialmente **4 raias** (ou compate as verticais).
   * Mais de 4 raias pode aumentar a altura além da proporção wide ($> 1.55$), gerando aviso de viewport height.

4. **Architecture — Deixe o compilador medir o canvas**:
   * No `architecture`, **omita `meta.viewBox`** no candidato inicial. O Archify calcula automaticamente as dimensões ideais baseadas nos componentes e rotas.

5. **Rotas e Cruzamentos**:
   * Comece com conexões automáticas sem pinos forçados (`fromSide`/`toSide`).
   * Adicione `fromSide` ou `toSide` apenas se necessário para direcionar o fluxo ou desviar de componentes intermediários.

---

## 4. Entrada a partir de Mermaid

Se o usuário fornecer Mermaid, traduza para o tipo semântico correspondente em Archify JSON:
* `flowchart` / `graph TD` $\rightarrow$ `workflow` ou `architecture`
* `sequenceDiagram` $\rightarrow$ `sequence`
* `stateDiagram` / `stateDiagram-v2` $\rightarrow$ `lifecycle`

---

## 5. Comandos CLI

```bash
# Ajuda e listagem de tipos
node skills/jev-diagram/diagram.js help
node skills/jev-diagram/diagram.js types

# Scaffolding de novo diagrama
node skills/jev-diagram/diagram.js scaffold architecture .archify/minha-arquitetura/
node skills/jev-diagram/diagram.js scaffold workflow .archify/meu-fluxo/

# Validação e compilação Showcase
node skills/jev-diagram/diagram.js finalize architecture .archify/minha-arquitetura/candidate.json .archify/minha-arquitetura/diagram.html

# Recomendação de tipo com base em cenário
node skills/jev-diagram/diagram.js guide "como as notas fiscais sao emitidas e integradas na sefaz"
```
