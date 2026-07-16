# Briefing UI/UX — Mesa de Texas Hold'em 🃏

**Documento:** Briefing UI/UX
**Autor:** Project Architect (revisão de UX aplicada ao código real)
**Público:** Owner do produto
**Status:** 10 de 10 itens concluídos e validados visualmente (16/07/2026, navegador headless
ponta a ponta) — ver [board](./BOARD_BRIEFING_UIUX_POKER.md) pro status detalhado de cada item
**Data:** 15/07/2026
**Escopo revisado:** [`client/src/ui/HoldemPanel.tsx`](../client/src/ui/HoldemPanel.tsx), [`client/src/index.css`](../client/src/index.css) (seções `.holdem-*`/`.game-*`/`.pcard`), [`server/src/games/holdem.ts`](../server/src/games/holdem.ts), [`shared/src/index.ts`](../shared/src/index.ts) (contrato `HoldemView`).

> Nota de processo: nasceu como revisão de **UX** (achados abaixo citam o código que os evidencia,
> descrito no passado — é o estado *antes* da correção). Todos os itens **A**–**I** foram
> implementados (o **E**, único que mexeu no contrato `@vo/shared`, com confirmação do owner antes
> de codar; o **A**/mesa radial só no modo ampliado, preservando o compacto como está — decisão
> UXP-6). Falta só validação visual em navegador do **A** (sem ferramenta de screenshot neste
> ambiente). Status vivo
> fica no [board](./BOARD_BRIEFING_UIUX_POKER.md), não neste texto.

---

## 1. Análise socrática (resumo)

- **O que está sendo pedido de fato?** Melhorar a experiência de quem já senta e joga a mão — não
  adicionar regra de negócio nova.
- **Prêmissa a testar:** a sessão anterior investiu bastante em polimento visual (timer de blinds,
  animações, ícones de fichas) — isso já resolve a dor real do jogador, ou faltou o essencial
  (saber que é sua vez, apostar rápido, ver a própria mão com destaque)?
- **Achado central:** o trabalho recente é *decorativo de qualidade* (animações, cores, pill de
  estágio), mas os **fundamentos de legibilidade de uma mesa de poker** — layout espacial, cartas
  próprias em destaque, notificação de turno, presets de aposta — ainda estão no nível mínimo
  viável. É o clássico caso de polir a superfície antes da estrutura.
- **O que é fácil reverter vs. difícil:** tudo abaixo é **CSS/JSX local em `HoldemPanel.tsx`**, sem
  tocar em `@vo/shared` nem no server — logo, **todo o escopo é de baixo risco e reversível**. Não
  há necessidade de confirmação prévia do owner para implementar; listo por prioridade e o owner
  escolhe o que entra.

---

## 2. Achados (por categoria, com evidência)

### A. A "mesa" não é uma mesa — é uma lista vertical
**Evidência:** [`HoldemPanel.tsx:288-291`](../client/src/ui/HoldemPanel.tsx#L288-L291) e
[`index.css:1034-1037`](../client/src/index.css#L1034-L1037) — `.holdem-seats { flex-direction: column }`,
`view.seats.map(seatLine)`.
**Problema:** mesmo no modo "Ampliar" (`.game-panel.expanded`), os jogadores aparecem como uma
lista empilhada, não distribuídos ao redor de uma mesa oval como em qualquer app de poker de
referência (PokerStars, Zynga). Isso custa: (1) não dá pra saber "de quem" alguém é vizinho de
aposta sem ler o texto; (2) o botão de dealer (🔘) e o destaque de turno competem por atenção no
mesmo eixo vertical que o pote/board, quando deveriam estar espacialmente separados.
**Sugestão:** no modo expandido (`big=true`), renderizar os assentos em posições absolutas ao
redor de uma elipse (6 posições fixas, `HOLDEM_MAX_SEATS=6`), com o board/pote no centro — mantendo
a lista vertical atual como fallback do modo compacto (`big=false`), que já funciona bem para esse
tamanho. É a mudança de **maior impacto visual**, mas também a de maior esforço (CSS de
posicionamento, não trivial).

### B. Ninguém avisa quando é a sua vez
**Evidência:** [`HoldemPanel.tsx:134`](../client/src/ui/HoldemPanel.tsx#L134) (`myTurn`) só reflete
no `.holdem-seat.turn` — [`index.css:1049-1052`](../client/src/index.css#L1049-L1052), um
`box-shadow` azul de 3px na lateral do próprio painel.
**Problema:** o Virtual Office é um mapa 2D onde o jogador pode estar andando, no chat ou numa
reunião. Não há timer de turno no Hold'em (decisão de produto documentada), então **a única pista
de que é sua vez é um detalhe visual sutil dentro de um painel que pode nem estar com foco/scroll
visível**. Sem som, sem título da aba piscando, sem badge. Em mesa de 5-6 jogadores isso trava o
jogo ("cadê fulano, será que travou?") sempre que alguém não está olhando pro painel.
**Sugestão (baixo esforço, alto impacto):**
- Piscar o `document.title` (ex.: `"🃏 Sua vez! — Virtual Office"`) enquanto `myTurn === true`.
- Badge sonoro opcional (toggle, respeita quem está em reunião/mudo).
- Reforçar visualmente: hoje o destaque de "sua vez" é o **mesmo** azul do `.stage-preflop` pill —
  cores concorrendo pelo mesmo significado. Trocar por um destaque exclusivo (borda pulsante ou
  cor reservada só pra "ação em você").

### C. Aposta: sem atalhos, e o input pode ficar "quebrado" sem explicação
**Evidência:** [`HoldemPanel.tsx:331-346`](../client/src/ui/HoldemPanel.tsx#L331-L346) — `raiseBy`
é `useState` sem `useEffect` que o sincronize com `view.minRaise`; o botão fica `disabled` quando
`raiseBy < view.minRaise` ([linha 341](../client/src/ui/HoldemPanel.tsx#L341)) mas **não há texto
visível explicando o mínimo** perto do botão desabilitado.
**Problema real (reproduzível por leitura do código):** jogador digita um valor de raise; antes da
sua vez, outro jogador re-raiza e `view.minRaise` sobe; o `raiseBy` do state **não acompanha** —
o botão "Raise" aparece desabilitado sem motivo aparente na tela. Frustra exatamente no momento de
maior tensão da mão (all-in/re-raise).
**Sugestão:**
- `useEffect` que eleva `raiseBy` para `Math.max(raiseBy, view.minRaise)` quando `minRaise` muda.
- Texto auxiliar `mín. {view.minRaise}` abaixo do input.
- Presets de aposta (½ pote, pote, all-in) como chips clicáveis antes do input numérico — reduz a
  ação mais frequente do jogo (apostar) de "digitar número" para "1 clique", e é o padrão que
  qualquer jogador de poker já espera (Hick's Law: menos decisões livres, mais atalhos reconhecíveis).

### D. As próprias cartas não têm destaque — ficam no meio da lista, do mesmo tamanho que as dos outros
**Evidência:** `seatLine()` ([`HoldemPanel.tsx:144-172`](../client/src/ui/HoldemPanel.tsx#L144-L172))
é a **mesma função** pra self e pra oponentes; `.holdem-seat-cards .pcard` renderiza 26×36px pra
todo mundo ([`index.css:1072-1076`](../client/src/index.css#L1072-L1076)).
**Problema:** a informação mais consultada durante uma mão (minhas cartas) não tem hierarquia
visual própria — o jogador precisa escanear a lista até achar a linha com "(você)" toda vez que
quer conferir a própria mão. Viola a heurística básica de "a informação mais usada deve ser a mais
acessível".
**Sugestão:** área fixa e maior (ex. 48×64px) para as cartas do próprio jogador, ancorada perto da
barra de ações (`.game-actions`), fora da lista de assentos — como a "mão na mão" fica em qualquer
app de poker.

### E. Countdown do showdown existe pro timer de blinds, mas não pro "próxima mão em instantes"
**Evidência:** [`HoldemPanel.tsx:282-284`](../client/src/ui/HoldemPanel.tsx#L282-L284) mostra texto
estático `"próxima mão em instantes…"`; o server usa `setTimeout(..., 8000)`
([`holdem.ts:385-389`](../server/src/games/holdem.ts#L385-L389)) mas **não expõe esse prazo no
`HoldemView`** — o client não tem como saber quanto falta.
**Problema:** a mesma sessão já implementou um countdown bonito pro timer de blinds
(`fmtTime`/`blind-countdown`) — o padrão existe, só não foi reaproveitado aqui. E é justamente
nesses 8s que o jogador precisa decidir "Mostrar Cartas" ou "Esconder" (feature nova desta mesma
sessão) — decisão tomada sem saber quanto tempo resta.
**Sugestão:** expor `nextHandAt: number | null` no `HoldemView` (server) e reaproveitar o
`fmtTime`/estilo `.blind-countdown` já existente pro contador de próxima mão. Baixo esforço — é
literalmente reutilizar o que já foi construído.

### F. Recompra automática é silenciosa
**Evidência:** [`holdem.ts:99`](../server/src/games/holdem.ts#L99) — `if (s.chips <= 0) s.chips = HOLDEM_BUYIN;`
sem qualquer sinal correspondente no `HoldemView`/client.
**Problema:** o jogador zera as fichas, a próxima mão começa e ele "magicamente" tem 500 de novo,
sem nenhuma mensagem. Pode ler como bug ("por que minhas fichas mudaram sozinhas?") em vez de
feature (rebuy de cortesia, documentado só no `CONHECIMENTO.md`, invisível pro usuário final).
**Sugestão:** toast local simples no client ("💸 Recompra automática: +500 fichas") quando detectar
`chips` do próprio assento subir entre duas mãos consecutivas partindo de 0 — não precisa de campo
novo no protocolo, dá pra inferir client-side comparando o `view` anterior com o atual.

### G. Ações irreversíveis sem confirmação: All-in e Levantar (fold implícito)
**Evidência:** [`HoldemPanel.tsx:347-352`](../client/src/ui/HoldemPanel.tsx#L347-L352) (All-in) e
[`355-359`](../client/src/ui/HoldemPanel.tsx#L355-L359) (Levantar); server: `leave()` aplica fold
automático se `inBetting()` ([`holdem.ts:74-84`](../server/src/games/holdem.ts#L74-L84)).
**Problema:** um clique errado em "All-in" compromete a pilha inteira; um clique errado em
"🚪 Levantar" no meio de uma mão foldão automaticamente uma mão que pode ter fichas relevantes
apostadas. Fichas são fictícias, mas a frustração de "cliquei sem querer" não é.
**Sugestão:** manter simples — não precisa de modal pesado. Um `title`/microcopy já ajuda
("segura pra confirmar" não é viável em botão simples; melhor: exigir 2º clique em 1.5s, padrão
"clique de novo pra confirmar" com texto do botão mudando pra "Confirmar all-in?" por um instante).

### H. Modo compacto virou o padrão, mas os novos elementos (timer de blind + pote) competem por espaço em 360px
**Evidência:** `const [big, setBig] = useState(false);` ([`HoldemPanel.tsx:87`](../client/src/ui/HoldemPanel.tsx#L87))
— antes era `true` (ver diff da sessão anterior); `.holdem-mesa-info` ([`index.css:845-851`](../client/src/index.css#L845-L851))
empilha pote + timer de blind (2 linhas de texto) lado a lado com `flex-wrap`, dentro de um painel
de `min(360px, 92vw)` ([`index.css:669`](../client/src/index.css#L669)).

**Decisão do owner (15/07/2026): intencional, manter.** O virtual-office é, na essência, um
ambiente tipo Gather para a squad de produto/dev — o Hold'em é uma feature de lounge secundária,
não deve tomar a tela toda. O modo recolhido/compacto é o estado correto por padrão: o usuário
precisa continuar vendo o escritório (colegas, mesas, chat) enquanto o jogo "aguarda" ele, com o
"Ampliar" disponível para quando ele realmente for jogar. **Não mexer no comportamento**
(`big=false` como padrão fica como está); o trabalho recomendado aqui é só **polir o visual do
estado recolhido** — sem precisar ser moderno, só legível: dá pra ver de relance que o jogo está
rolando e se é sua vez, sem competir com o resto da tela. Ver item **B** / card **UXP-1** (aviso de turno) como a
peça que mais atende esse objetivo.

### I. Acessibilidade: nada de `aria-live`
**Evidência:** nenhuma ocorrência de `aria-live`/`role="status"` em `HoldemPanel.tsx`.
**Problema:** mudanças de estágio, vencedor da mão e "é sua vez" são só visuais — leitor de tela
não anuncia nada disso.
**Sugestão:** um `<div aria-live="polite" className="sr-only">` que narra transições-chave
(mudança de estágio, "sua vez", vencedor). Esforço baixo, mas é o item mais fácil de esquecer.

---

## 3. Priorização sugerida

| # | Item | Impacto | Esforço | Toca contrato (`@vo/shared`)? |
|---|---|---|---|---|
| 1 | B — notificar "sua vez" (título da aba + destaque exclusivo) | Alto | Baixo | Não |
| 2 | C — sincronizar `raiseBy` com `minRaise` + texto do mínimo | Alto | Baixo | Não |
| 3 | D — área destacada para as próprias cartas | Alto | Médio | Não |
| 4 | E — countdown da próxima mão (reaproveita `fmtTime`) | Médio | Baixo* | Sim (novo campo `nextHandAt`) |
| 5 | C — presets de aposta (½ pote / pote / all-in) | Médio | Médio | Não |
| 6 | H — validar visualmente modo compacto vs. decidir padrão | Médio | Baixo (decisão) | Não |
| 7 | F — toast de recompra automática | Baixo | Baixo | Não |
| 8 | G — confirmação de All-in / Levantar em mão ativa | Baixo | Baixo | Não |
| 9 | I — `aria-live` para transições-chave | Baixo | Baixo | Não |
| 10 | A — mesa radial (layout espacial real) | Muito alto | Alto | Não |

*Item 4 tem esforço baixo de implementação, mas é o único que toca `@vo/shared` (novo campo no
`HoldemView`) — segundo a regra do projeto, isso é "difícil de reverter" e passa por confirmação
antes de codar, mesmo sendo uma mudança pequena.

**Sequenciamento recomendado:** 1 → 2 → 3 → 6 (decisão rápida) → 7 → 8 → 9 → 5 → 4 → 10. Os 4
primeiros já resolvem as maiores fontes de fricção com esforço baixo; a mesa radial (item 10) fica
como aposta de fundo de roadmap, não bloqueia nada.

---

## 4. O que eu não validei

Não há ferramenta de screenshot/browser automatizado neste ambiente — toda a análise acima é
**leitura de código + CSS**, não observação visual direta no navegador. Os itens B, C, D, E, F, G, I
são inferências de comportamento a partir da lógica (bastante confiáveis, pois seguem diretamente
do fluxo de estado). O item H é explicitamente marcado como hipótese a confirmar visualmente.
