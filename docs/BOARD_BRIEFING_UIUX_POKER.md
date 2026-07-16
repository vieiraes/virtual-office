# Board — Briefing UI/UX Poker

**Última atualização:** 16/07/2026 11:58

> Referência: [`BRIEFING_UIUX_POKER.md`](./BRIEFING_UIUX_POKER.md).

- [x] ✅ **UXP-1** — Notificado "sua vez": título da aba pisca (`🃏 Sua vez! · Virtual Office`)
      enquanto for a vez do jogador, e badge próprio `.holdem-turn-badge` (rosa `#ec4899`,
      pulsante, respeita `prefers-reduced-motion`) no header — não reaproveita mais a cor da pill
      de estágio nem do destaque de assento (`.holdem-seat.turn` também migrou pra essa cor).
      Visível mesmo com o painel recolhido, já que o header sempre renderiza. Evidência:
      `client/src/ui/HoldemPanel.tsx` (hook `isMyTurn`/título) + `client/src/index.css`
      (`.holdem-turn-badge`, `@keyframes turn-pulse`). `npm run typecheck` e `npm run build` ok.
- [x] ✅ **UXP-2** — `raiseBy` agora sobe junto com `view.minRaise` (`useEffect` com `Math.max`);
      texto "mín. X" visível abaixo do input; `max` do input limitado ao que o jogador pode
      apostar (`chips - toCall`). Evidência: `client/src/ui/HoldemPanel.tsx`
      (`maxRaise`/`.holdem-raise-hint`) + `client/src/index.css`. Typecheck/build ok.
- [x] ✅ **UXP-3** — Nova seção `.holdem-my-hand` ("sua mão"), ancorada logo abaixo do board/pote —
      não exige rolar até a lista de assentos pra conferir a própria mão. Cartas maiores
      (44×60px vs. 26×36px na lista) e com sombra própria; fica com opacidade reduzida se você
      foldou (tag "foldou"). Só renderiza quando você tem cartas na mão atual
      (`mySeat.cards.length > 0`). Evidência: `client/src/ui/HoldemPanel.tsx` (bloco
      `.holdem-my-hand`, antes de `.holdem-winners`) + `client/src/index.css`
      (`.holdem-my-hand*`). Typecheck/build ok.
- [x] ✅ **UXP-4** — Owner confirmou a mudança de contrato (15/07/2026). Novo campo
      `nextHandAt: number | null` em `HoldemView` (`shared/src/index.ts`); `holdem.ts` seta
      `Date.now() + 8000` no início do `finishHand()` (junto com o `setTimeout` existente) e limpa
      pra `null` em `startHand()`/`resetToLobby()`. Client reaproveita `fmtTime` pra mostrar
      "próxima mão em M:SS" no lugar do texto estático — visível mesmo quando há a decisão de
      mostrar/esconder cartas (`canShowMuck`), que é justamente a janela em que o prazo importava.
      Testado isoladamente com `HoldemGame` via `tsx` (all-in → ~8s de `nextHandAt` → mão nova
      auto-inicia e `nextHandAt` volta a `null`). Typecheck/build ok.
      **Efeito colateral limpo de graça:** removida uma `const showdown` morta em `view()` que
      tinha ficado sem uso depois do refactor de `showingCards` da sessão anterior.
- [x] ✅ **UXP-5** — Presets de aposta (½ pote / pote / max) como pílulas antes do input de raise;
      cada um chama `clampRaise()`, que arredonda e limita entre `view.minRaise` e `maxRaise`
      (`chips - toCall`) — nunca deixa o botão "Raise" desabilitado por causa de um preset. "max"
      usa o mesmo caminho de `raise` (não o botão separado de `allin`); se o valor cobrir todas as
      fichas, o server já converte pra all-in automaticamente (`holdem.ts` — `if (seat.chips <=
      needed) return this.act(id, 'allin')`). Evidência: `client/src/ui/HoldemPanel.tsx`
      (`.holdem-raise-presets`) + `client/src/index.css` (`.raise-preset-btn`). Typecheck/build ok.
- [x] ✅ **UXP-6** — Decidido pelo owner (15/07/2026): modo compacto continua padrão (`big=false`).
      O projeto é essencialmente um Gather para a squad — o poker é feature de lounge secundária e
      não deve dominar a tela. Como polimento do estado recolhido: `.game-panel` (compartilhado com
      Damas) ficou um pouco mais translúcido (opacidade 0.94→0.86, `backdrop-filter` mais leve) pra
      deixar o escritório atrás mais perceptível; o modo `.expanded` (Ampliar, foco total na mesa)
      ficou mais opaco (0.97) em compensação. Combinado com o badge de "sua vez" (UXP-1), dá pra
      perceber o estado do jogo de relance sem o painel dominar a tela. Arquivo:
      `client/src/index.css` (`.game-panel`, `.game-panel.expanded`).
- [x] ✅ **UXP-7** — Toast "💸 Recompra automática: +500 fichas" quando `mySeat.chips` sobe de 0
      no início de uma nova mão (`preflop`). Detecção 100% client-side via `lastSeenChipsRef`
      (compara o valor anterior antes de sobrescrever) — não precisou de campo novo no contrato.
      Some sozinho em 4s. Evidência: `client/src/ui/HoldemPanel.tsx` (`showRebuyToast`) +
      `client/src/index.css` (`.holdem-rebuy-toast`, `@keyframes toast-fade`). Typecheck/build ok.
- [x] ✅ **UXP-8** — Confirmação de 2 cliques via `confirmableAction()`: 1º clique troca o texto do
      botão ("Confirmar all-in?" / "Confirmar — perde a mão?") e arma um timeout de 2.5s; 2º clique
      dentro da janela executa. "Levantar" só exige confirmação quando há algo em jogo
      (`mySeat.inHand && betting`) — fora de mão ativa continua saindo direto, sem clique extra
      inútil. Evidência: `client/src/ui/HoldemPanel.tsx` (`pendingConfirm`/`confirmableAction`) +
      `client/src/index.css` (`.confirm-pending`, respeita `prefers-reduced-motion`). Typecheck/
      build ok.
- [x] ✅ **UXP-9** — Região `aria-live="polite"` (classe `.sr-only`, utilitário novo em
      `index.css`) narrando: "é a sua vez", resultado da mão com vencedores, ou a etapa atual
      (flop/turn/river/showdown). Evidência: `client/src/ui/HoldemPanel.tsx` (`liveMessage`).
      Typecheck/build ok — não verificado com leitor de tela real (sem ferramenta disponível neste
      ambiente).
- [x] ✅ **UXP-10** — Mesa radial implementada, só no modo **ampliado** (`expanded`); o modo
      compacto continua a lista vertical exatamente como antes (decisão UXP-6 preservada — zero
      risco no caminho mais usado). `holdem-table-oval` é uma elipse com "carpete" verde e borda
      simulando a aba da mesa; pote/cartas comunitárias/timer de blind ficam centralizados
      (`holdem-table-center`, reaproveita o mesmo `communityInner` do modo compacto — sem duplicar
      JSX). Assentos em `holdem-radial-seat`, posicionados por trigonometria (`radialPos`) — testado
      isoladamente para 2 a 6 jogadores, distribuição sempre simétrica e sem sobreposição. **Sua
      própria cadeira sempre aparece embaixo** (`orderedSeats` rotaciona o array pra começar em
      você, preservando a ordem relativa = ordem de turno dos demais) — testado isoladamente com
      4 assentos em todas as posições de "self". Destaque de turno reaproveita o rosa do badge
      "sua vez" (UXP-1); destaque azul próprio marca qual cadeira é a sua. Evidência:
      `client/src/ui/HoldemPanel.tsx` (`orderedSeats`, `radialPos`, `radialSeat`,
      `communityInner`) + `client/src/index.css` (`.holdem-table-oval`, `.holdem-table-center`,
      `.holdem-radial-seat*`).

      **Validado visualmente (16/07/2026)** com 2 navegadores headless reais (Playwright +
      Chromium, dois jogadores simulados de ponta a ponta: entrar → andar até a zona → sentar →
      iniciar mão → ampliar). Screenshot confirma: elipse com carpete verde/aba marrom, meu
      assento sempre embaixo com borda azul, oponente com borda rosa pulsante quando é a vez dele
      (mesma cor do badge UXP-1), cartas próprias visíveis e as do oponente viradas, pote/board/
      timer de blind centralizados.

      **Dois bugs reais encontrados e corrigidos durante essa validação** (nenhum dos dois é do
      código desta sessão — pré-existiam):
      1. `client/src/game/OfficeScene.ts` — StrictMode do React monta o `Phaser.Game` 2x em dev; a
         1ª instância podia deixar sua inscrição no store (`useStore.subscribe`) viva por um tick
         a mais, e quando outro jogador entrava, o callback da cena já destruída tentava desenhar
         num `scene` nulo e derrubava a aba. Corrigido com guarda `if (!this.sys?.isActive())
         return;` em `diffRemotes`/`tintNearby`.
      2. `client/src/ui/HoldemPanel.tsx` (cálculo de `levelIdx`) — **bug crítico**: `elapsed =
         now - gameStartTime` podia dar negativo no primeiro render após uma mão começar (o state
         `now` só atualiza 1s depois via `setInterval`), gerando `BLIND_LEVELS[-1]` → `undefined`
         → `curBlinds.sb` quebrava o `<HoldemPanel>` inteiro **sem error boundary**, derrubando o
         app inteiro (tela em branco) toda vez que uma mão começava, para qualquer jogador, sempre
         que houvesse qualquer intervalo entre carregar a página e apertar "Iniciar mão" — ou seja,
         quase sempre, em uso real. Corrigido com `Math.max(0, ...)` no cálculo de `levelIdx`.

      Typecheck/build ok após as correções.
