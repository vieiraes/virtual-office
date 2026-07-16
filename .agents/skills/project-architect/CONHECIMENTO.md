# 🧠 CONHECIMENTO — Arquiteto do Virtual Office

> Arquivo **exclusivo** do agente *Arquiteto do Projeto*. Mapa mental derivado do código real.
> Leia no início de cada tarefa; atualize ao fim de cada atuação relevante (com evidência).
> **Última revisão:** 15/07/2026 — bootstrap inicial (leitura completa de `client/`, `server/`, `shared/`)
> + revisão de UX do Hold'em (ver [`docs/BRIEFING_UIUX_POKER.md`](../../../docs/BRIEFING_UIUX_POKER.md)).

---

## 1. O que é / topologia
Escritório virtual 2D estilo Gather: avatar anda pelo mapa; ao se aproximar de alguém, abre
**áudio+vídeo P2P por proximidade** (WebRTC), chat de vizinhança, ferramentas ágeis (sprints,
cards, planning poker) e mini-games (Texas Hold'em, damas).

**Monorepo npm workspaces** (raiz `package.json`), 3 pacotes:

| Pacote | Papel | Stack |
|---|---|---|
| `shared/` (`@vo/shared`) | **Contrato único** client↔server: tipos, eventos, constantes de mundo, regras geométricas | TS puro |
| `server/` | Express + Socket.io: presença, sinalização WebRTC, board, motores de jogo | Node 22, socket.io |
| `client/` | UI + jogo | React 18 + Vite + **Phaser 3** + **zustand** + socket.io-client |

Scripts raiz: `dev` (concurrently server+client), `build` (client depois server), `start`
(server serve `client/dist` + socket na mesma porta), `typecheck` (server + client).

**Dev:** client Vite `:5173` faz proxy de `/socket.io` → server `:3001` (ver [vite.config.ts](../../../client/vite.config.ts)).
**Prod:** um único processo Express serve `client/dist` estático + Socket.io ([server/src/index.ts](../../../server/src/index.ts)).

---

## 2. `@vo/shared` é a FONTE DA VERDADE (regra de ouro)
Todo tipo, evento e constante que cruza a fronteira client↔server vive em
[shared/src/index.ts](../../../shared/src/index.ts). **Nunca** duplique um literal dos dois lados —
importe do shared. Mudar esse arquivo é **difícil de reverter** (quebra os dois lados) → análise
socrática + confirmação com o owner.

Constantes-chave de mundo: `MAP_WIDTH=1600`, `MAP_HEIGHT=1200`, `MOVE_SPEED=260`, `AVATAR_SIZE=32`,
`CONNECT_RADIUS=110`, `DISCONNECT_RADIUS=160`, `PROXIMITY_INTERVAL_MS=250`, `MOVE_SEND_HZ=15`,
`WARROOM_COOLDOWN_MS=30_000`, `HIDDEN_VOTE='·'`, `POKER_VALUES`, zonas (`MEETING_ROOM`,
`HOLDEM_ZONE`, `CHECKERS_ZONE`) + helpers `isInZone` / `isInMeetingRoom`.
Hold'em: `HOLDEM_BUYIN=500`, blinds `5/10`, `HOLDEM_MAX_SEATS=6`.

---

## 3. Contrato de eventos socket (superfície completa)
### Client → Server
`join` (ack `JoinAck`), `move`, `media-state`, `chat`,
`sprint-create` · `sprint-status` · `sprint-delete`,
`card-create` · `card-status` · `card-sprint` · `card-assign` · `card-points` · `card-delete`,
`poker-start` · `poker-vote` · `poker-reveal` · `poker-end`, `warroom-call`,
`holdem-sit` · `holdem-leave` · `holdem-start` · `holdem-action`,
`checkers-sit` · `checkers-leave` · `checkers-move` · `checkers-reset`,
`webrtc-offer` · `webrtc-answer` · `webrtc-ice`.

### Server → Client
`player-joined` · `player-moved` · `player-left` · `player-media`,
`room-state`, `holdem-state`, `checkers-state`, `chat`, `warroom`,
`webrtc-offer` · `webrtc-answer` · `webrtc-ice`.

Handlers: [server/src/handlers.ts](../../../server/src/handlers.ts) (todos num `io.on('connection')`).
Client listeners: [client/src/net/socket.ts](../../../client/src/net/socket.ts).

---

## 4. Presença e movimento (client-authoritative)
- O client roda a física no Phaser ([OfficeScene.ts](../../../client/src/game/OfficeScene.ts)) e
  emite `move` a **15 Hz** (throttle por `MOVE_SEND_HZ`) — envia também no instante em que **para**
  (`stoppedNow`). O servidor confia na posição e faz `broadcast.emit('player-moved')`.
- Remotos são **interpolados** (`Phaser.Math.Linear(..., 0.3)`) pra suavizar os ~15 Hz.
- A posição própria é espelhada no store a cada envio → usada pela proximidade e por quem entra depois.
- **Reconexão:** o `socket.id` muda; o `connect` handler re-emite `join` com nome/cor/role e recebe
  snapshot novo. `pickSpawn()` é `players.size % SPAWN_POINTS.length` (determinístico, não aleatório).

---

## 5. Proximidade (histerese) — RN-001
[proximity.ts](../../../client/src/game/proximity.ts): entra no set a **≤110px**, só sai a **≥160px**.
A folga evita "flapping" (liga/desliga na fronteira). Roda em `setInterval` **fora do loop do Phaser**
de propósito — o Phaser pausa em abas em background, mas quem está minimizado ainda precisa detectar
colega chegando pra aceitar a chamada (setInterval é throttled ~1s em bg, suficiente).
`updateNearby()` retorna `null` quando nada mudou (evita re-render/efeitos à toa) e ordena os ids.

**Detalhe geométrico:** mesas ficam a ~280px centro-a-centro (ver [map.ts](../../../client/src/game/map.ts)),
acima do `DISCONNECT_RADIUS` → quem senta numa mesa **não** ouve a mesa vizinha. Ao mudar os raios,
reavalie o layout das mesas.

---

## 6. WebRTC mesh P2P ([PeerManager.ts](../../../client/src/net/PeerManager.ts))
Mesh completo: 1 `RTCPeerConnection` por peer próximo (ok até ~10 pessoas; vídeo 320×240@15).
- **Iniciador determinístico:** no par (A,B), quem tem `socket.id` **lexicograficamente menor** cria
  a offer. O outro é **accept-on-offer** (cria o peer ao receber a offer). Isso **elimina glare** por
  construção — não há offers simultâneas.
- **Buffer de ICE:** candidatos que chegam antes do `setRemoteDescription` são enfileirados
  (`pendingIce`) e aplicados no `flushIce`.
- **Espectador** (sem câmera/mic, `getUserMedia` negado): sem tracks a offer sairia sem m-lines →
  adiciona `addTransceiver('audio'|'video', { direction: 'recvonly' })` pra ainda **receber** mídia.
- Limpeza só em `connectionState === 'failed'` (o `'disconnected'` é transitório; o afastamento
  normal já é coberto pela histerese simétrica dos dois lados).
- **ICE atual = só STUN** do Google. **GOTCHA:** NAT simétrico (redes corporativas/CGNAT) precisa de
  **TURN** — não configurado. Adicionar em `RTC_CONFIG.iceServers` (ver README). Risco alto/crítico
  no `VISAO_DE_PRODUTO.md`.

**Câmera nunca liga sozinha (RN-002):** `camOn` começa `false` no server e no store; ao aproximar só
áudio+chat. Cada um liga a própria câmera manualmente. Invariante de privacidade — não quebrar.

---

## 7. Sala de reunião: board ágil + planning poker
Estado em `RoomState` (`sprints`, `cards`, `poker`) no server ([state.ts](../../../server/src/state.ts)).
- **Permissões:** quase toda mutação é **PO-only** (`isPO()` checa `role === 'po'`). **Exceção
  proposital:** `card-status` é **aberto a todos** — o dev marca o próprio card como concluído.
  (No código atual o `Role` só muda isso + emoji do avatar; não há auth real — ver RN em Papéis.)
- **Planning poker blind voting (RN-004):** enquanto `poker.revealed === false`, `roomSnapshot()`
  mascara **todos** os votos com `HIDDEN_VOTE ('·')`. Só no `poker-reveal` (PO) o server manda os
  valores reais. A máscara é aplicada na **serialização** (state.ts), não no armazenamento — o server
  sempre tem o voto real; o segredo é no broadcast.
- Ao sair (`disconnect`), o voto do jogador é removido do poker.

---

## 8. War room — RN-003
`warroom-call` (PO-only) → `io.emit('warroom', { fromName })` para todos. **Cooldown** de
`WARROOM_COOLDOWN_MS` (30s) guardado em `lastWarRoomAt` **no closure do `registerHandlers`**
(compartilhado entre todos os sockets — é global, não por-socket). Client mostra banner
([WarRoomBanner.tsx](../../../client/src/ui/WarRoomBanner.tsx)).

---

## 9. Jogos do lounge (servidor-autoritativo)
### Texas Hold'em ([holdem.ts](../../../server/src/games/holdem.ts) + [cards.ts](../../../server/src/games/cards.ts))
- Classe `HoldemGame` com callback `onChange`; o server manda **uma view por socket** (`view(id)`)
  porque as cartas dos outros são secretas até o showdown.
- Fichas fictícias, **recompra automática** ao zerar; blinds 5/10; **heads-up** trata dealer=SB.
- **Sem timer de turno**; quem **sai da zona** (`move` fora de `HOLDEM_ZONE`) é foldado/removido.
- **Side pots corretos** por níveis de contribuição (`total`) no `finishHand`; próxima mão automática
  após 8s. Avaliador: `evaluate7` (melhor 5 de 7), score empacotado em base-13 (categoria + desempates),
  trata roda (A-2-3-4-5).
- **Gotcha:** `startHand` valida `seats.length >= 2`; a lógica de fechamento de rodada de aposta está
  em `afterAction`/`advanceStage` — mexer aqui é delicado (all-in, side pots). Teste heads-up e 3+.
- **UX (15/07/2026):** o poker é feature de lounge **secundária** — o produto é essencialmente um
  Gather pra squad de dev/PO, então o painel não deve dominar a tela. `big` (`HoldemPanel.tsx`)
  começa `false` (modo recolhido) **de propósito**, decisão confirmada pelo owner — não reverter
  pra `true`. Aviso de "é sua vez" agora existe fora do foco do painel: título da aba pisca
  (`document.title`) e badge `.holdem-turn-badge` (rosa `#ec4899`, cor exclusiva, não reaproveita as
  cores das stage-pills) aparece no header, visível mesmo recolhido. `.game-panel` (compartilhado
  com Damas) ficou mais translúcido no modo compacto (opacidade 0.86) pra deixar o mapa por trás
  perceptível; `.expanded` ficou mais opaco (0.97) como "modo foco". Também ganhou: seção "sua mão"
  (`.holdem-my-hand`) com cartas próprias maiores, ancorada logo abaixo do board (não precisa rolar
  até a lista de assentos); presets de aposta (½ pote/pote/max) antes do input de raise, todos
  passando por `clampRaise()` (nunca deixam o botão "Raise" desabilitado); countdown real da
  próxima mão (`view.nextHandAt`, campo novo em `HoldemView` — único item que mexeu em
  `@vo/shared`, com confirmação do owner antes de codar); toast de recompra automática
  (100% client-side, sem campo novo no contrato); confirmação de 2 cliques em All-in/Levantar
  durante mão ativa; região `aria-live` narrando turno/etapa/vencedor; e **mesa radial** no modo
  ampliado (`holdem-table-oval`/`holdem-radial-seat`, posições por trigonometria) — só no
  `expanded`, o modo compacto continua a lista vertical de sempre. Sua própria cadeira sempre
  renderiza embaixo (`orderedSeats` rotaciona o array de assentos, sem mexer na ordem real de
  turno do server). **10 dos 10 itens do board concluídos e validados visualmente** (16/07/2026,
  2 navegadores headless simulando uma mão completa de ponta a ponta).

  **Bug crítico encontrado nessa validação e corrigido:** `levelIdx` (timer de blinds,
  `HoldemPanel.tsx`) podia computar `-1` no primeiro render após uma mão começar
  (`elapsed = now - gameStartTime` fica negativo até o primeiro tick do `setInterval`), e
  `BLIND_LEVELS[-1].sb` derrubava o `<HoldemPanel>` inteiro sem error boundary — ou seja, **a tela
  ficava em branco toda vez que uma mão começava**, pra qualquer jogador, sempre que houvesse
  qualquer intervalo entre carregar a página e clicar "Iniciar mão". Corrigido com
  `Math.max(0, ...)`. Ver também o gotcha de StrictMode×Phaser (§11) achado na mesma sessão.

  Ver [`docs/BRIEFING_UIUX_POKER.md`](../../../docs/BRIEFING_UIUX_POKER.md) +
  [`docs/BOARD_BRIEFING_UIUX_POKER.md`](../../../docs/BOARD_BRIEFING_UIUX_POKER.md).

### Damas ([checkers.ts](../../../server/src/games/checkers.ts))
- Regras **casuais brasileiras simplificadas**: peça anda 1 diagonal à frente, captura salta em
  qualquer diagonal, **cadeia obrigatória** após a 1ª captura, promoção na última linha; dama anda 1
  casa em qualquer diagonal (**sem dama voadora**). Captura **não** é obrigatória. Brancas começam.
- Tabuleiro 8×8, índice `y*8+x`, células `'' b w B W`. **Toda legalidade é validada no server**
  (`move`). Abandono (`leave`) recomeça o jogo. 2 assentos + plateia.

**Padrão comum dos jogos:** classe no server com `onChange`, assentos por `socket.id`, `sit` valida
zona, `leave`/`disconnect` limpa, broadcast de view. Reaproveite esse molde pra jogos novos.

---

## 10. Persistência do board ([persist.ts](../../../server/src/persist.ts))
- Sprints+cards gravados em `DATA_DIR/board.json` com **debounce de 400ms** (rajada de edições = 1 write).
- `poker` **não** é persistido (efêmero). `nextCardId`/`nextSprintId` são persistidos.
- `DATA_DIR` default = `./data`; em prod aponta pra `[env] DATA_DIR` do `fly.toml`.

### ⚠️ DRIFT CONHECIDO (resolver / decidir com o owner)
Há **inconsistência** entre 3 fontes sobre persistência em produção:
- [fly.toml](../../../fly.toml) (working tree, **modificado**): tem `[mounts] vo_data → /data` e `DATA_DIR=/data` (**com volume, board persiste**).
- [README.md](../../../README.md): diz que `DATA_DIR` está em `/tmp/vo-data` efêmero (**sem volume, board zera no redeploy**).
- Memória do projeto: "board zera a cada redeploy (sem volume)".

→ Decidir a estratégia oficial (volume vs efêmero) e alinhar `fly.toml` + README + memória. Só o
owner decide (impacta custo e dados). **Não** deployar sem confirmar.

---

## 11. Fronteira Phaser × React (gotcha de teclado)
Phaser renderiza num canvas com loop 60fps; o React desenha os painéis por cima. Quando um input do
React ganha foco (chat, meeting), seta `chatFocused` no store → o `OfficeScene` **desliga o teclado do
Phaser** (`kb.enabled=false`, `kb.disableGlobalCapture()`, zera velocidade) pra você conseguir digitar
sem o avatar andar / sem o Phaser comer as setas via `preventDefault`. Ao desfocar, reativa.
Ver [OfficeScene.ts:118-131](../../../client/src/game/OfficeScene.ts) e os `onFocus/onBlur` nos painéis.
**Sempre** limpe `chatFocused` no unmount do painel (há `useEffect(() => () => setState({chatFocused:false}))`).

Avatares são **gerados por textura** (quadrado colorido arredondado + olhos direcionais), 5 texturas
por cor (idle + 4 direções), cacheadas por key `avatar-<cor>-<dir>`. Não há spritesheet (decisão de
produto: removeram LPC — ver commit `5b04a2d`/`bcc7ae4`).

**Gotcha StrictMode × Phaser (16/07/2026):** em dev, o `React.StrictMode` (`main.tsx`) monta o
`PhaserGame` 2x (efeito roda, desmonta, roda de novo — padrão do React 18 pra achar cleanup
quebrado). Isso cria e destrói um `Phaser.Game` "fantasma" a cada carga de página. Se a inscrição
da 1ª instância no `useStore` (dentro de `create()`, em `OfficeScene.ts`) não for cancelada a
tempo, um evento de store (ex.: outro jogador entrando) pode disparar o callback da cena já
destruída, que tenta criar um GameObject com `scene` nulo → `TypeError` → derruba a aba inteira
(sem error boundary no app). Mitigado com guarda `if (!this.sys?.isActive()) return;` no topo de
`diffRemotes`/`tintNearby`. Só reproduz em dev (StrictMode não roda em build de produção), e só
quando há 2+ jogadores — por isso passou despercebido antes. Se adicionar nova subscription no
`create()`, replique a guarda.

---

## 12. Build & deploy
- **Dockerfile** multi-stage: build com todo o monorepo → runtime só com `server/dist` + `client/dist`
  + deps de produção. **Node puro, sem tsx/typescript** em runtime (cabe na VM de 256MB do Fly).
- **fly.toml:** região `gru`, `force_https` (obrigatório: `getUserMedia` só em HTTPS),
  `min_machines_running=0` (dorme sem ninguém, acorda no 1º acesso — custo ~zero). `swap_size_mb=256`.
- No ar em **https://virtualoffice.fly.dev**. **Deploy é do owner** (`fly deploy` na raiz).

---

## 13. Dívida técnica / oportunidades conhecidas
(consolidado de `docs/SUGESTOES_CODIGO.md` em 16/07/2026 — arquivo apagado depois de servir seu
propósito de relatório pontual do `docs-curator`; conteúdo migrado pra cá + leitura do código)

1. **Culling de rede** — `move` faz broadcast pra todos os clientes, inclusive distantes no mapa.
   Sugestão: spatial partitioning (servidor só emite update pra quem está no raio visual) + delta
   compression (só reenviar se o delta de posição/direção mudar o suficiente). Arquivo:
   `server/src/handlers.ts`.
2. **Sem namespaces/rooms do Socket.io** — quem senta no poker ainda escuta os eventos globais de
   `move` à toa. Sugestão: namespace `/poker` (ou room por mesa) pra quem está sentado parar de
   escutar movimento alheio. Arquivo: `server/src/handlers.ts`.
3. **`handlers.ts` risco de God Object** — todos os eventos num arquivo só. Jogos já saíram pra
   classes próprias (`server/src/games/*.ts` — ver §9); falta extrair sprints/cards/planning-poker
   pra um módulo/serviço dedicado.
4. **Sem TURN** — só STUN configurado; P2P falha em NAT simétrico (rede corporativa). Sugestão:
   Coturn próprio ou provedor (Twilio/Metered) referenciado no `fly.toml`. Ver §6.
5. **Volume vs banco real** — persistência é `board.json` num volume Fly (`vo_data`, **ativo em
   produção desde 15/07** — ver §10 e §12). Funciona bem no tamanho atual, mas não escala
   horizontalmente; considerar Postgres/Supabase/Firestore na Fase 3.
6. **Phaser não pausa** quando um painel React toma a tela cheia (ex.: board de PO) → roda o loop de
   60fps à toa, gasta GPU/bateria. Arquivo: `client/src/game/OfficeScene.ts`.

Nenhum item é urgente (otimização/robustez, não bug). O de maior impacto na experiência real é o #4
(TURN) — sem ele, um colega em rede corporativa restrita simplesmente não ouve/vê ninguém, e isso
falha silenciosamente (sem erro visível pro usuário).

---

## 14. Comandos úteis
```bash
npm run dev         # server :3001 + client :5173 (proxy /socket.io)
npm run typecheck   # server + client — rodar SEMPRE antes de concluir
npm run build       # client/dist + server/dist
npm start           # prod local (Express serve tudo em :3001)
```
Testar multiusuário: 2 abas em `localhost:5173` (localhost é secure context → câmera/mic sem HTTPS),
ou Chrome com `--use-fake-device-for-media-stream --user-data-dir=/tmp/vo-user-N`. Debug WebRTC:
`chrome://webrtc-internals`.

---

## 15. Receitas de extensão (siga os padrões existentes)
- **Novo evento socket:** tipo do payload em `@vo/shared` → handler em `handlers.ts` (validando
  `players.has(socket.id)` e permissão) → listener em `client/src/net/socket.ts` → estado no `store.ts`.
- **Novo jogo no lounge:** zona em `@vo/shared` (`XXX_ZONE` + validação de `sit` na zona) → classe
  server no molde de `holdem`/`checkers` (`onChange`, assentos por id, view por socket se houver
  segredo) → desenho da mesa em `map.ts` (+ colisão) → painel React no molde de `HoldemPanel`.
- **Mudar o mapa:** editar `client/src/game/map.ts` (retângulos top-left). Zonas de interação que o
  **server** valida ficam no `@vo/shared`, não no map.ts.
- **Nova regra de negócio:** implemente no código → **acione o `docs-curator`** pra refletir no
  `VISAO_DE_PRODUTO.md` (catálogo RN). Você não cura os docs de produto; ele sim.

---

## 16. Coordenação com outros agentes
- **`docs-curator`** — dono de `docs/` (Visão de Produto, boards, regras de negócio). Nunca edita
  código. Você aciona ele quando muda uma RN. `docs/` é sala compartilhada: você pode usar, mas a
  curadoria oficial é dele.
- **`skill-creator`** — cria novos agentes especialistas. Se o projeto precisar de um novo papel
  (ex.: especialista em WebRTC, em QA), peça a ele.

> **Convenção cross-IDE:** o repo alterna entre VSCode (Copilot: `.github/copilot-instructions.md`) e
> Antigravity (`.agents/`). Ambos os `.md` de instrução exigem **análise socrática antes de agir** —
> respeite os dois. A camada `.agents/` é a fonte comum dos agentes.
