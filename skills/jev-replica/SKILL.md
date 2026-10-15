---
name: jev-replica
description: Clona qualquer aplicativo, site ou plataforma web/mobile através de engenharia reversa clean-room em 11 fases (Recon, Architect, Design, Build, Backend, Test, Diff, Entrepreneur, Brand, Launch, Deploy). Use quando o usuário pedir "clona esse app", "recria esse site", "engenharia reversa desse produto", "cria um clone de X", "analisa reviews dos concorrentes e cria uma alternativa", ou "replica essa plataforma".
---

# /jev-replica — Suíte de Clonagem e Engenharia Reversa Clean-Room (JEV + Replica)

O **/jev-replica** é um framework completo de 11 fases para clonar, reconstruir e aprimorar qualquer aplicação web, mobile ou SaaS através de engenharia reversa **clean-room**.

> **Regra Fundamental de Clean-Room**: Reconstrói **o que o app faz**, nunca **o que ele possui**. Telas, fluxos de uso e modelos de dados inferidos — sem copiar código original, logos, marcas registradas ou textos proprietários.

---

## 1. As 11 Fases do Pipeline

O pipeline opera de forma incremental. Cada etapa salva seus artefatos na pasta `replica/` do projeto, servindo de insumo para a etapa seguinte:

```text
recon ➔ architect ➔ design ➔ build ➔ backend ➔ test ➔ diff ➔ entrepreneur ➔ brand ➔ launch ➔ deploy
```

| Fase / Comando | Função | Saída Principal em `replica/` |
|---|---|---|
| **`/replica-recon`** | Engenharia reversa de telas, fluxos de usuário, componentes e modelo de dados inferido a partir de páginas públicas, documentação e screenshots. | `replica/recon.md`, `replica/features.csv` |
| **`/replica-architect`** | Planejamento da stack tecnológica moderna, schema do banco de dados, contratos de API e ordem de implementação. | `replica/architecture.md` |
| **`/replica-design`** | Reconstrução do design system: tokens de cores, escala tipográfica, espaçamento e componentes com seus próprios assets e ícones livres. | `replica/tokens.json`, `replica/design-system.md` |
| **`/replica-build`** | Reconstrução da casca do aplicativo e telas tela a tela a partir do mapa do recon, dando baixa em `features.csv`. | Código-fonte frontend / views |
| **`/replica-backend`** | Implementação de autenticação, banco de dados, endpoints de API, pagamentos (Stripe, etc.) e integrações externas. | Código-fonte backend / rotas / migrations |
| **`/replica-test`** | Automação de testes ponta a ponta (E2E Playwright), validação de fluxos felizes e de exceção, catálogo de bugs por severidade (S1 a S4). | `replica/test-plan.md`, `replica/bug-report.md` |
| **`/replica-diff`** | Medição da paridade visual e funcional contra o original. Calcula score de paridade (%) e lista pendências faltantes. | `replica/parity-report.md`, `replica/diff/` |
| **`/replica-entrepreneur`** | Mineração de avaliações reais de usuários (G2, Capterra, App Store, Reddit) para identificar as maiores dores/reclamações e transformá-las em diferenciais. | `replica/opportunities.md`, `replica/positioning.md` |
| **`/replica-brand`** | Criação de identidade única para o produto: novo nome, paleta de cores original, logo e varredura de termos para garantir zero resquícios do original. | `replica/brand.md`, `sweep.py` report |
| **`/replica-launch`** | Redação de landing page persuasiva baseada no posicionamento único, estratégia de precificação e copy para lojas de apps. | `replica/landing-page.md`, `replica/store-listing.json` |
| **`/replica-deploy`** | Checklist de pré-voo (testes, varredura de marca, paridade), provisionamento de infraestrutura e publicação no seu próprio domínio. | `replica/deploy.md` |

---

## 2. Ferramentas e Utilitários Embutidos

A suíte inclui utilitários Python (Python 3.8+, zero dependências externas ou bibliotecas padrão) localizados na pasta da skill:

* **Varredura de Limpeza de Marca (`sweep.py`)**:
  ```bash
  python3 <skill-dir>/replica-brand/sweep.py --original "NomeAntigo" --project .
  ```
  Localiza e alerta referências acidentais a marcas registradas ou nomes do produto original antes do lançamento.

* **Calculadora de Contraste WCAG (`contrast.py`)**:
  ```bash
  python3 <skill-dir>/replica-design/contrast.py --tokens replica/tokens.json
  ```
  Garante acessibilidade AAA/AA nas combinações de cores do design system.

* **Comparador de Paridade e Diff de Imagens (`parity.py` / `imgdiff.py`)**:
  ```bash
  python3 <skill-dir>/replica-diff/parity.py --features replica/features.csv
  python3 <skill-dir>/replica-diff/imgdiff.py original.png clone.png diff.png
  ```
  Avalia o índice de paridade percentual do clone.

* **Minerador e Analisador de Reviews (`reviews.py`)**:
  ```bash
  python3 <skill-dir>/replica-entrepreneur/reviews.py --input reviews.json --themes <skill-dir>/replica-entrepreneur/themes.json
  ```
  Categoriza as maiores queixas dos clientes da concorrência para fundamentar os diferenciais.

* **Validador de Listagem de Loja (`listing.py`)**:
  ```bash
  python3 <skill-dir>/replica-launch/listing.py replica/store-listing.json
  ```
  Valida limites de caracteres, palavras-chave e diretrizes de submissão da App Store / Google Play.

---

## 3. Guia Passo a Passo de Execução

### Exemplo Prático: Clonando uma Plataforma Web ou App

1. **Inicie o Reconhecimento**:
   Peça: `"Execute /replica-recon na URL https://exemplo.com ou com estas capturas de tela"`.
   O agente navegará ou analisará a documentação/telas, gerando a lista de telas, componentes e `replica/features.csv`.

2. **Desenhe a Arquitetura**:
   Peça: `"Execute /replica-architect para propor a stack (ex: Next.js + Tailwind + Postgres) e schema das entidades"`.
   O agente estruturará tabelas, relacionamentos e endpoints.

3. **Extraia o Design System**:
   Peça: `"Execute /replica-design para definir as variáveis de design tokens, paleta e tipografia"`.
   O agente gera `replica/tokens.json` e configura o Tailwind/CSS.

4. **Construa o Frontend e Backend**:
   Com `/replica-build` e `/replica-backend`, implemente as telas em ordem de prioridade dos fluxos críticos, conectando banco e regras de negócio.

5. **Teste e Valide Paridade**:
   Rode `/replica-test` para gerar os testes e `/replica-diff` para conferir o percentual de paridade contra a especificação inicial.

6. **Diferenciação com o Empreendedor**:
   Com `/replica-entrepreneur`, encontre o que os usuários do concorrente mais odeiam (ex: cobrança por usuário, complexidade excessiva, falta de suporte) e ajuste o produto para resolver exatamente essas dores.

7. **Rebranding e Lançamento**:
   Use `/replica-brand` e execute o `sweep.py` para garantir que o projeto seja 100% autônomo e seguro juridicamente. Por fim, `/replica-launch` e `/replica-deploy` colocam a versão no ar.
