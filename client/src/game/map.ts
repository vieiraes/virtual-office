import { MAP_HEIGHT, MAP_WIDTH } from '@vo/shared';

/** Retângulos em coordenadas top-left (px do mundo). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FLOOR_COLOR = 0x2b2d31;
export const FLOOR_GRID_COLOR = 0x35373c;
export const WALL_COLOR = 0x1e1f22;
export const DESK_COLOR = 0x8b5a2b;
export const DESK_TOP_COLOR = 0xa9743d;
export const RUG_COLOR = 0x3d4a5c;
export const POKER_FELT_COLOR = 0x1d6b3c;
export const POKER_RIM_COLOR = 0x5a3a22;
export const CHECKERS_LIGHT_COLOR = 0xd9b98c;
export const CHECKERS_DARK_COLOR = 0x6e4a2a;

const T = 24; // espessura da parede

export const walls: Rect[] = [
  // bordas
  { x: 0, y: 0, w: MAP_WIDTH, h: T },
  { x: 0, y: MAP_HEIGHT - T, w: MAP_WIDTH, h: T },
  { x: 0, y: 0, w: T, h: MAP_HEIGHT },
  { x: MAP_WIDTH - T, y: 0, w: T, h: MAP_HEIGHT },
  // divisória da sala de reunião (canto inferior direito), com vão de porta
  { x: 1100, y: 760, w: 340, h: T },
  { x: 1540, y: 760, w: 60, h: T },
  { x: 1100, y: 760, w: T, h: 200 },
  { x: 1100, y: 1060, w: T, h: 140 },
];

// Mesas afastadas de propósito: centros a ~280px, acima do DISCONNECT_RADIUS
// (160px) — quem está sentado numa mesa não ouve a conversa da mesa vizinha.
export const desks: Rect[] = [
  // ilha de mesas 1 (2×3)
  { x: 240, y: 240, w: 140, h: 70 },
  { x: 520, y: 240, w: 140, h: 70 },
  { x: 800, y: 240, w: 140, h: 70 },
  { x: 240, y: 520, w: 140, h: 70 },
  { x: 520, y: 520, w: 140, h: 70 },
  { x: 800, y: 520, w: 140, h: 70 },
  // ilha de mesas 2 (2×2)
  { x: 1160, y: 240, w: 140, h: 70 },
  { x: 1160, y: 520, w: 140, h: 70 },
  { x: 1380, y: 380, w: 140, h: 70 },
  // mesa de reunião (dentro da sala)
  { x: 1230, y: 880, w: 220, h: 110 },
  // sofá/lounge (canto inferior esquerdo) — área de conversa em grupo
  { x: 240, y: 900, w: 220, h: 60 },
  { x: 240, y: 1020, w: 220, h: 60 },
];

/** Tapetes decorativos (sem colisão). */
export const rugs: Rect[] = [
  { x: 200, y: 860, w: 320, h: 260 }, // lounge
  { x: 1180, y: 830, w: 320, h: 210 }, // sala de reunião
  { x: 550, y: 850, w: 540, h: 250 }, // área de jogos
];

// Mesas de jogo do lounge (com colisão): as zonas de interação em volta
// delas ficam em @vo/shared (HOLDEM_ZONE / CHECKERS_ZONE) porque o servidor
// também valida quem pode sentar.
export const pokerTable: Rect = { x: 595, y: 925, w: 140, h: 90 };
export const checkersTable: Rect = { x: 910, y: 930, w: 100, h: 80 };
