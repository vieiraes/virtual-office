export type Dir = 'up' | 'down' | 'left' | 'right';

export type Role = 'dev' | 'qa' | 'po';

export const ROLE_LABELS: Record<Role, string> = {
  dev: '💻 Dev',
  qa: '🧪 QA',
  po: '📋 PO',
};

export const ROLE_EMOJI: Record<Role, string> = {
  dev: '💻',
  qa: '🧪',
  po: '📋',
};

export interface Player {
  id: string;
  name: string;
  color: string;
  role: Role;
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
  micOn: boolean;
  /** Câmera NUNCA abre sozinha ao aproximar — cada um liga a própria manualmente. */
  camOn: boolean;
}

export interface MediaStatePayload {
  micOn: boolean;
  camOn: boolean;
}

export interface PlayerMediaPayload extends MediaStatePayload {
  id: string;
}

export interface ChatSendPayload {
  /** Destinatários: os peers do círculo de conversa atual do remetente. */
  to: string[];
  text: string;
}

export interface ChatInPayload {
  from: string;
  text: string;
}

export interface JoinPayload {
  name: string;
  color: string;
  role: Role;
}

// ---------- sala de reunião: cards + planning poker ----------

/** Interior da sala de reunião (canto inferior direito do mapa). */
export const MEETING_ROOM = { x: 1124, y: 784, w: 452, h: 392 };

export function isInMeetingRoom(p: { x: number; y: number }): boolean {
  return (
    p.x >= MEETING_ROOM.x &&
    p.x <= MEETING_ROOM.x + MEETING_ROOM.w &&
    p.y >= MEETING_ROOM.y &&
    p.y <= MEETING_ROOM.y + MEETING_ROOM.h
  );
}

export const POKER_VALUES = ['1', '2', '3', '5', '8', '13', '?'] as const;

/** Marcador de voto ainda oculto (antes do PO revelar). */
export const HIDDEN_VOTE = '·';

// ---------- sprints ----------

export type SprintStatus = 'planned' | 'active' | 'done';

export const SPRINT_STATUS_LABELS: Record<SprintStatus, string> = {
  planned: '📅 Planejada',
  active: '🚀 Ativa',
  done: '✅ Concluída',
};

export interface Sprint {
  id: number;
  name: string;
  status: SprintStatus;
}

export type CardStatus = 'todo' | 'doing' | 'done';

export const CARD_STATUSES: CardStatus[] = ['todo', 'doing', 'done'];

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  todo: '⬜ A fazer',
  doing: '🔵 Em andamento',
  done: '✅ Concluído',
};

export interface JiraCard {
  id: number;
  title: string;
  /** null = backlog (fora de qualquer sprint). */
  sprintId: number | null;
  status: CardStatus;
  assigneeId: string | null;
  /** Nome gravado na atribuição — sobrevive se a pessoa sair. */
  assigneeName: string | null;
  points: string | null;
}

export interface PokerState {
  cardId: number;
  revealed: boolean;
  /** id → valor votado; enquanto não revelado o servidor mascara com HIDDEN_VOTE. */
  votes: Record<string, string>;
}

export interface RoomState {
  sprints: Sprint[];
  cards: JiraCard[];
  poker: PokerState | null;
}

// ---------- war room (reunião de emergência) ----------

/** Intervalo mínimo entre convocações — evita spam do botão. */
export const WARROOM_COOLDOWN_MS = 30_000;

export interface WarRoomPayload {
  fromName: string;
}

// ---------- área de jogos (lounge) ----------

/** Zonas em volta das mesas de jogo: dentro delas o painel do jogo aparece. */
export const HOLDEM_ZONE = { x: 540, y: 850, w: 250, h: 240 };
export const CHECKERS_ZONE = { x: 850, y: 850, w: 220, h: 240 };

export function isInZone(
  p: { x: number; y: number },
  z: { x: number; y: number; w: number; h: number },
): boolean {
  return p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h;
}

// ---------- Texas Hold'em ----------

export const HOLDEM_BUYIN = 500;
export const HOLDEM_SMALL_BLIND = 5;
export const HOLDEM_BIG_BLIND = 10;
export const HOLDEM_MAX_SEATS = 6;

export type HoldemStage = 'lobby' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export type HoldemAction = 'fold' | 'check' | 'call' | 'raise' | 'allin' | 'showCards';

/** Carta no formato rank+naipe, ex: 'As' (Ás de espadas), 'Td', '9h', '2c'. */
export type Card = string;

export interface HoldemSeatView {
  id: string;
  name: string;
  chips: number;
  /** Aposta na rodada de apostas atual. */
  bet: number;
  folded: boolean;
  allIn: boolean;
  /** Participa da mão em andamento (sentou antes do deal). */
  inHand: boolean;
  /** Revelou as cartas voluntariamente (ou por ser o ganhador no showdown) */
  showingCards?: boolean;
  /** Cartas visíveis para este viewer (próprias ou no showdown); null = ocultas. */
  cards: Card[] | null;
}

export interface HoldemWinner {
  id: string;
  name: string;
  amount: number;
  hand: string;
}

export interface HoldemView {
  stage: HoldemStage;
  seats: HoldemSeatView[];
  community: Card[];
  pot: number;
  currentBet: number;
  minRaise: number;
  turnId: string | null;
  dealerId: string | null;
  winners: HoldemWinner[] | null;
  /** Timestamp (Date.now()) de quando a próxima mão começa automaticamente; null fora do showdown. */
  nextHandAt: number | null;
}

// ---------- damas ----------

/** '' vazio; b/w peça preta/branca; B/W dama. Tabuleiro 8x8, índice = y*8+x. */
export type CheckersCell = '' | 'b' | 'w' | 'B' | 'W';

export type CheckersSide = 'b' | 'w';

export interface CheckersView {
  board: CheckersCell[];
  black: { id: string; name: string } | null;
  white: { id: string; name: string } | null;
  turn: CheckersSide;
  winner: CheckersSide | null;
  /** Índice da peça obrigada a continuar uma cadeia de capturas, ou null. */
  chainFrom: number | null;
}

export interface JoinAck {
  selfId: string;
  players: Player[];
  room: RoomState;
}

export interface MovePayload {
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
}

export interface PlayerMovedPayload extends MovePayload {
  id: string;
}

export interface SignalOffer {
  to: string;
  sdp: RTCSessionDescriptionInit;
}

export interface SignalOfferIn {
  from: string;
  sdp: RTCSessionDescriptionInit;
}

export interface SignalIce {
  to: string;
  candidate: RTCIceCandidateInit;
}

export interface SignalIceIn {
  from: string;
  candidate: RTCIceCandidateInit;
}

// World
export const MAP_WIDTH = 1600;
export const MAP_HEIGHT = 1200;
export const MOVE_SPEED = 260; // px/s
export const AVATAR_SIZE = 32;

// Proximity (hysteresis: connect close, disconnect farther, avoids flapping).
// As mesas ficam a ~280px de centro a centro — acima do DISCONNECT_RADIUS,
// então quem está sentado numa mesa não ouve a conversa da mesa vizinha.
export const CONNECT_RADIUS = 110;
export const DISCONNECT_RADIUS = 160;
export const PROXIMITY_INTERVAL_MS = 250;

// Network
export const MOVE_SEND_HZ = 15;

export const SPAWN_POINTS: Array<{ x: number; y: number }> = [
  { x: 200, y: 200 },
  { x: 300, y: 200 },
  { x: 200, y: 300 },
  { x: 300, y: 300 },
  { x: 400, y: 200 },
  { x: 400, y: 300 },
  { x: 200, y: 400 },
  { x: 300, y: 400 },
  { x: 400, y: 400 },
  { x: 500, y: 300 },
];

export const AVATAR_COLORS = [
  '#e74c3c',
  '#3498db',
  '#2ecc71',
  '#f1c40f',
  '#9b59b6',
  '#e67e22',
  '#1abc9c',
  '#fd79a8',
];
