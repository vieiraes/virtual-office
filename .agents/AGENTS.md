# Instruções para o LLM — Virtual Office

> **Nota de Contexto:** Plataforma **Virtual Office 2D** (Phaser 3 + Socket.io + WebRTC).
> Este repositório contém a **web** (client) e o **server** para o backend de multiplayer.

## Regra obrigatória: análise socrática antes de agir

Para **toda demanda** solicitada (feature, correção, refactor, análise, decisão de arquitetura), faça **primeiro uma análise socrática** antes de implementar ou responder em definitivo.

### O que a análise socrática deve fazer:

1. **Fazer perguntas-chave** que expõem premissas, ambiguidades e trade-offs da demanda.
2. **Apostar na causa raiz**: quando necessário, utilizar a técnica dos "5 porquês" para ir ao fundo de um problema, sempre estimulando a solução e não a busca por culpados.
3. **Questionar evidências e consequências**: perguntar "De onde veio essa informação?" e "O que aconteceria se levássemos essa ideia ao extremo?" para testar a solidez das premissas e antecipar impactos.
4. **Responder a essas perguntas com base no código/contexto real** — ler os arquivos antes de afirmar.
5. **Explicitar dependências, riscos e o que muda de forma difícil de reverter** (URLs, schema, migrations, contratos, públicos APIs, etc.).
6. **Só então propor o plano/execução**.

### Quando confirmar com o owner antes de codar:

Se a demanda tiver:

- **Ambiguidade relevante** (não fica claro qual a solução ideal)
- **Impacto difícil de reverter** (schema, migrations, contratos, URLs públicas)
- **Decisão arquitetural** que afeta a evolução futura do projeto

Nestes casos, apresentar a análise e **confirmar com o owner antes de codar**.

Para mudanças **locais, isoladas e reversíveis**, a análise pode ser curta e seguir direto para a implementação.

### Formato recomendado da análise:

```
1. Perguntas socráticas
   - [Pergunta 1]
   - [Pergunta 2]
   - [...]

2. Respostas/Achados
   - [Resposta 1 — com base no código]
   - [Resposta 2 — com base no código]
   - [...]

3. Trade-offs e Riscos
   - [Trade-off 1]
   - [Risco 1]
   - [...]

4. Plano recomendado
   - Passo 1
   - Passo 2
   - [...]
```

---

## Workflow e Conventions

### Git

- **NUNCA commitar ou fazer push automaticamente.**
- Só commitar/push quando o usuário pedir explicitamente (ex: "commita", "envia pro github", "faz o push").
- Após edições de arquivos, apenas confirmar o que foi feito — não encadear git add/commit/push por conta própria.

### Migrations / Banco (Supabase)

O fluxo depende de **quem é a fonte da verdade do schema**. **Identifique o caso do projeto**
antes de agir (existência de `supabase/migrations/`, papel do Prisma, etc.) e siga o fluxo correspondente:

#### A) Supabase CLI (SQL) como fonte da verdade

- Aplica-se quando o schema (DDL/RLS/policies/triggers) vive em `supabase/migrations/`.
- Fonte da verdade: SQL versionado em `supabase/migrations/`.
- Ao criar/alterar uma migration, aplicar no remoto na mesma sessão:
  ```bash
  supabase db push --linked --include-all
  supabase migration list --linked   # o remoto deve bater com o local
  ```
- Se o projeto **também usa Prisma**, ele é **apenas introspecção**: após aplicar, sincronizar o
  client com `prisma db pull` (**NUNCA** `prisma migrate` — o Prisma não é dono do schema).
- Projeto **sem Prisma**: igual, só sem a etapa de `prisma db pull`.

#### B) Prisma ORM como fonte da verdade

- Aplica-se quando **não há** `supabase/migrations/` e o schema é definido no Prisma.
- Fonte da verdade: `packages/db/prisma/schema.prisma`; migrations em `packages/db/prisma/migrations/`.
- Conexão: `DATABASE_URL` (pooler, 6543) para runtime; `DIRECT_URL` (5432) para migrations.
- Aplicar na mesma sessão (em `packages/db`):
  ```bash
  npx prisma migrate dev --name <descricao_curta>   # dev: cria a migration do diff e aplica
  npx prisma migrate deploy                          # remoto: aplica apenas pendentes
  npx prisma migrate status                          # validar ("up to date")
  ```
- **Não** usar `supabase db push` neste fluxo.

> Sempre validar que a migration foi aplicada corretamente no ambiente remoto antes de seguir.

### Deploy

- Deploy no Firebase/Fly.io é sempre executado pelo usuário ou com permissão explícita.
- Quando um passo exigir deploy, solicitar explicitamente para o usuário executar.

### Documentação de planejamento

- Documentos de planejamento de features futuras devem ser criados **dentro do projeto** (ex: `docs/`), NUNCA em memória de sessão.
- Se estiver em modo Plan (sem permissão para criar arquivos), avisar o usuário para mudar para modo Agent antes de continuar.

### Board de acompanhamento (BOARD)

- Todo documento de análise/relatório que gere itens acionáveis (ex: `CODE_REVIEW.md`) deve ter um **board de acompanhamento** associado em `docs/`.
- **Nomenclatura:** `BOARD_[arquivo de referência].md` (ex: `CODE_REVIEW.md` → `BOARD_CODE_REVIEW.md`).
- **Formato:** lista única de cards (checklist), sem colunas nem seção de progresso.
  - Apenas dois status: `⬜ Pendente` e `✅ Concluído`.
  - Ao concluir, marcar `[x]` e o tick `✅`; **cards concluídos permanecem no arquivo** (não apagar).
  - Cada card: ID sequencial (ex: `RTQ-1`), título curto e referência ao(s) arquivo(s) afetado(s).
- **Sempre** manter no topo o carimbo **"Última atualização: DD/MM/AAAA HH:MM"** e atualizá-lo a cada mudança no board.

### Curadoria de documentação (`docs/`)

- **Manter a documentação de `docs/` sempre atualizada após cada atuação** (feature, fix, refactor, decisão): sincronizar checkboxes/status e boards com o estado real do código.
- **Nunca marcar item como concluído sem evidência no código** — ler os arquivos/rodar verificações antes de afirmar; anexar nota curta de evidência.
- Itens que ficaram obsoletos/N/A: sinalizar com `~~texto~~` + motivo, **não apagar**.
- Existe o agente especialista **`docs-curator`** (`.agents/skills/docs-curator/SKILL.md`) para essa tarefa — delegar a ele curadorias/sincronizações da pasta `docs/`.
- **Escopo do `docs-curator` (inegociável):** o agente edita **exclusivamente** arquivos dentro de `docs/`. **Nunca** altera código nem arquivos fora de `docs/`. Pode sugerir melhorias e, se útil, escrever um arquivo de sugestões em `docs/` (ex.: `docs/SUGESTOES_CODIGO.md`); qualquer mudança de código é sempre do agente principal/owner.

## Agentes especialistas do projeto (equipe)

Agentes vivem em `.agents/skills/<nome>/SKILL.md` (convenção cross-IDE; funciona no Antigravity ao lado das instruções do Copilot). A pasta `docs/` é a **"sala de reunião"** compartilhada — **todo membro pode usar**; a única restrição é do `docs-curator`, que **nunca edita código**.

| Agente | Papel | Dono de | Nunca toca |
|---|---|---|---|
| **`project-architect`** (`Arquiteto do Projeto`) | Arquiteto sênior / membro da equipe: features, refactors, bugs, decisões técnicas | Código (`client/`/`server/`/`shared/`), `Dockerfile`/`fly.toml`, e seu próprio `CONHECIMENTO.md`; pode usar `docs/` | — |
| **`docs-curator`** (`Docs Curator`) | Curadoria da documentação e dono da Visão de Produto | `docs/` (Visão de Produto, boards, RNs) | **Código** — jamais edita nada fora de `docs/` |
| **`skill-creator`** (`Skill Creator`) | Meta-agente: fabrica novos agentes especialistas na convenção do projeto | `.agents/skills/` | Código de produção |

- O **`project-architect`** mantém um arquivo de conhecimento **exclusivo** (`.agents/skills/project-architect/CONHECIMENTO.md`): mapa mental do projeto que ele lê no início e atualiza ao fim de cada atuação relevante. Quando uma **regra de negócio** mudar, ele aciona o `docs-curator` para sincronizar `docs/VISAO_DE_PRODUTO.md`.
- Para criar um novo especialista (ex.: WebRTC, QA, DevOps), use o **`skill-creator`** — ele já embute as convenções (análise socrática, git/deploy, arquivo de conhecimento próprio).
