# 🏢 Virtual Office

Escritório virtual 2D estilo [Gather](https://gather.town) para o squad: cada pessoa tem um
avatar, anda pelo mapa e, **ao se aproximar de alguém, uma chamada de áudio + vídeo começa
automaticamente** — afastou, encerrou.

## Como funciona

- **Mapa 2D** (Phaser 3): escritório com mesas, sala de reunião e lounge. Ande com **setas ou WASD**.
  As mesas ficam a ~280px umas das outras — acima do raio de desconexão, então quem está
  "sentado" numa mesa não ouve a conversa da mesa vizinha.
- **Presença em tempo real** (Socket.IO): posições sincronizadas entre todos (~15 Hz, client-authoritative).
- **Voz por proximidade** (WebRTC P2P mesh): conecta a **≤110px**, desconecta a **≥160px**
  (histerese evita liga/desliga na fronteira). Quem tem o socket id menor inicia a offer — sem glare.
- **Câmera nunca abre sozinha**: ao se aproximar só o áudio + chat ficam ativos; cada pessoa
  liga a própria câmera manualmente no botão (o outro lado vê o vídeo quando ela ligar).
- **Chat do círculo de conversa**: painel de texto que só aparece quando há alguém perto, e as
  mensagens só chegam a quem estava no círculo no momento do envio.
- **Ferramentas de PO** (sala de reunião): sprints + cards estilo Jira com status
  (A fazer / Em andamento / Concluído), progresso da sprint e planning poker. Persistidos em
  JSON no servidor.
- **War Room** 🚨: quem entrou como **PO** pode convocar todo mundo pra sala de reunião de
  qualquer lugar do mapa (ex.: incidente em produção). Um banner aparece pra todos os logados
  por 45s; cooldown de 30s entre chamadas evita spam.
- **Área de jogos** (lounge): mesa de **Texas Hold'em** com fichas fictícias e mesa de
  **damas** — sente-se aproximando o avatar da mesa; afastou-se, levantou. É uma feature
  secundária de socialização — o painel abre recolhido por padrão pra não competir com o mapa.
- **Sem servidor de mídia**: até ~10 pessoas em mesh P2P. Vídeo em 320×240@15 de propósito
  (cada track sobe para todos os peers próximos).
- **Sem cadastro**: entra com nome, cor do avatar e um papel no squad (**Dev / QA / PO**) — o
  papel decide quem controla o board da sala de reunião e a War Room.

## Rodando em dev

```bash
npm install
npm run dev
# client: http://localhost:5173  |  server: http://localhost:3001
```

Abra **duas abas** em `localhost:5173`, entre com nomes diferentes e aproxime os avatares.
`localhost` é secure context, então câmera/microfone funcionam sem HTTPS.

### Testando com câmera fake (várias "pessoas" na mesma máquina)

```bash
google-chrome --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --user-data-dir=/tmp/vo-user-1
google-chrome --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --user-data-dir=/tmp/vo-user-2
```

Cada instância simula um usuário distinto com câmera fake (padrão verde + tom) e permissão
auto-concedida. Debug de WebRTC: `chrome://webrtc-internals`.

## Build e produção

```bash
npm run build   # gera client/dist
npm start       # Express serve client/dist + Socket.IO na mesma porta (PORT, default 3001)
```

### Deploy no Fly.io (recomendado — `fly.toml` pronto)

```bash
fly launch --no-deploy   # usa o fly.toml e o Dockerfile existentes; confirme o app name
fly deploy
fly open
```

O `fly.toml` já configura `internal_port = 3001`, `force_https` (obrigatório: `getUserMedia`
só funciona em HTTPS) e região `gru` (São Paulo). Com `min_machines_running = 0` a máquina
dorme quando ninguém está online e acorda no primeiro acesso — custo praticamente zero para
uso de squad.

Alternativas: **Railway** (`railway up`, detecta o Dockerfile) ou **VPS**
(`docker build -t virtual-office . && docker run -p 80:3001 virtual-office`, com Caddy/nginx
com TLS na frente).

## ⚠️ Se alguém não conectar vídeo (TURN)

STUN puro (Google) resolve a maioria dos NATs, mas **NAT simétrico** (algumas redes
corporativas/CGNAT) exige um servidor TURN. É só configuração — adicione em
`client/src/net/PeerManager.ts` (`RTC_CONFIG.iceServers`):

```ts
{ urls: 'turn:seu-turn.example.com:3478', username: '...', credential: '...' }
```

Opções: [metered.ca](https://www.metered.ca/tools/openrelay/) (tier grátis 500MB/mês) ou
[coturn](https://github.com/coturn/coturn) self-hosted no mesmo VPS.

## Ferramentas de PO (sala de reunião)

O painel abre para quem está **dentro da sala de reunião**; quem entrou como **PO** tem os
controles de edição:

- **Sprints**: o PO cria sprints (tabs no topo do painel), muda o status
  (📅 Planejada / 🚀 Ativa / ✅ Concluída) e apaga (os cards voltam ao backlog).
- **Cards**: o PO cria cards no backlog ou direto numa sprint, atribui responsável, move
  entre sprints e apaga. **Qualquer pessoa** muda o status do card
  (⬜ A fazer / 🔵 Em andamento / ✅ Concluído) — o dev marca o próprio trabalho.
- **Progresso**: a sprint mostra `X/Y concluídos` com barra; quando todos os cards terminam,
  o painel sugere encerrar a sprint.
- **Planning poker**: o PO abre a votação de um card; todos na sala votam às cegas
  (1, 2, 3, 5, 8, 13, ?), o PO revela e aplica a média nos pontos do card.

O board persiste em `data/board.json` no servidor (`DATA_DIR` muda o diretório).

O `fly.toml` já vem com um **volume persistente** por padrão (`[mounts] vo_data → /data`,
`DATA_DIR=/data`), então sprints/cards sobrevivem a um redeploy. O volume precisa existir antes do
primeiro deploy com essa config:

```bash
fly volumes create vo_data --size 1 --region gru
```

Para **menor custo/menos recursos** (ex.: portfólio QA, sem necessidade de manter dados entre
deploys), **use storage efêmero** em vez do volume: remova o bloco `[mounts]` do `fly.toml` e troque
`DATA_DIR` para algo como `/tmp/vo-data` — um redeploy volta a zerar o board.

## Área de jogos (lounge) 🎮

Duas mesas no lounge, ao lado dos sofás. Aproxime o avatar da mesa e o painel do jogo abre;
**afastar-se da mesa faz levantar** (no poker vale como fold). Espectadores na zona veem a
partida.

- **🃏 Texas Hold'em** (até 6): fichas fictícias (500 de buy-in, recompra automática ao
  zerar — sem apostas reais em nenhum momento), blinds escalonados em níveis de torneio
  (timer visível), side pots corretos, revelação progressiva do board em all-in. As cartas dos
  outros só aparecem no showdown (ou se o jogador optar por mostrar) — o servidor manda para
  cada jogador apenas a própria mão. Painel abre compacto por padrão; **Ampliar** mostra uma
  mesa radial com os assentos ao redor do pote. Sem timer de turno: combinem no áudio de
  proximidade, que já conecta quem está na mesma mesa.
- **⛀ Damas** (2 jogadores + plateia): regras casuais — peça anda 1 diagonal à frente,
  captura salta em qualquer diagonal com cadeia obrigatória, promoção vira dama (anda 1 casa
  em qualquer diagonal). Captura não é obrigatória. Brancas começam.

## Estrutura

```
shared/   tipos + constantes (raios de proximidade, mapa, zonas de jogo, eventos)
server/   Express + Socket.IO: presença + sinalização WebRTC + board + jogos
  src/persist.ts           board (sprints/cards) em JSON no disco
  src/games/holdem.ts      Texas Hold'em server-autoritativo (mãos, apostas, side pots)
  src/games/checkers.ts    damas (validação de movimento no servidor)
  src/games/cards.ts       baralho + avaliador de mãos (melhor 5 de 7)
client/   React + Vite + Phaser 3 + zustand
  src/net/PeerManager.ts   mesh WebRTC (iniciador determinístico, buffer de ICE)
  src/game/OfficeScene.ts  mapa, movimento, colisão, interpolação, proximidade
  src/game/map.ts          layout do escritório (retângulos) — edite aqui para mudar o mapa
  src/ui/MeetingPanel.tsx  sprints + cards + planning poker
  src/ui/WarRoomBanner.tsx banner de convocação de emergência (PO)
  src/ui/HoldemPanel.tsx   mesa de poker
  src/ui/CheckersPanel.tsx mesa de damas
```