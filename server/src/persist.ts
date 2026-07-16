import fs from 'node:fs';
import path from 'node:path';
import type { JiraCard, Sprint } from '@vo/shared';

/**
 * Persistência do board (sprints + cards) em JSON no disco — sobrevive a
 * restart do processo. Em produção aponte DATA_DIR para um volume; sem isso
 * um redeploy do container zera o board.
 */
const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data');
const BOARD_FILE = path.join(DATA_DIR, 'board.json');

export interface BoardData {
  sprints: Sprint[];
  cards: JiraCard[];
  nextCardId: number;
  nextSprintId: number;
}

export function loadBoard(): BoardData {
  const empty: BoardData = { sprints: [], cards: [], nextCardId: 1, nextSprintId: 1 };
  try {
    const raw = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8')) as Partial<BoardData>;
    return {
      sprints: Array.isArray(raw.sprints) ? raw.sprints : [],
      cards: Array.isArray(raw.cards) ? raw.cards : [],
      nextCardId: typeof raw.nextCardId === 'number' ? raw.nextCardId : 1,
      nextSprintId: typeof raw.nextSprintId === 'number' ? raw.nextSprintId : 1,
    };
  } catch {
    return empty;
  }
}

let saveTimer: NodeJS.Timeout | null = null;

/** Grava com debounce — edições em rajada (drag de vários cards) viram 1 write. */
export function saveBoard(data: BoardData) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(BOARD_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[persist] falha ao gravar board:', err);
    }
  }, 400);
}
