import type { Player, PokerState, RoomState } from '@vo/shared';
import { HIDDEN_VOTE, SPAWN_POINTS } from '@vo/shared';
import { loadBoard, saveBoard } from './persist.js';

export const players = new Map<string, Player>();

export function pickSpawn(): { x: number; y: number } {
  return SPAWN_POINTS[players.size % SPAWN_POINTS.length];
}

// ---------- sala de reunião (board carregado do disco) ----------

const boardData = loadBoard();

export const room: RoomState = {
  sprints: boardData.sprints,
  cards: boardData.cards,
  poker: null,
};

let nextCardId = boardData.nextCardId;
let nextSprintId = boardData.nextSprintId;

export function allocCardId(): number {
  return nextCardId++;
}

export function allocSprintId(): number {
  return nextSprintId++;
}

/** Chame depois de qualquer mudança em sprints/cards — grava com debounce. */
export function persistBoard() {
  saveBoard({ sprints: room.sprints, cards: room.cards, nextCardId, nextSprintId });
}

/** Snapshot para broadcast: votos mascarados enquanto o PO não revelar. */
export function roomSnapshot(): RoomState {
  let poker: PokerState | null = room.poker;
  if (poker && !poker.revealed) {
    poker = {
      ...poker,
      votes: Object.fromEntries(Object.keys(poker.votes).map((id) => [id, HIDDEN_VOTE])),
    };
  }
  return { sprints: room.sprints, cards: room.cards, poker };
}
