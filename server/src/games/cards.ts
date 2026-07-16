import type { Card } from '@vo/shared';

/** Baralho e avaliador de mãos de poker (melhor 5 de 7). */

const RANKS = '23456789TJQKA';
const SUITS = 'shdc';

export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) deck.push(r + s);
  // Fisher–Yates
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const HAND_NAMES = [
  'carta alta',
  'um par',
  'dois pares',
  'trinca',
  'sequência',
  'flush',
  'full house',
  'quadra',
  'straight flush',
];

export interface HandResult {
  /** Comparável: categoria e desempates empacotados em um único número. */
  score: number;
  name: string;
}

function rankOf(card: Card): number {
  return RANKS.indexOf(card[0]); // 0 (dois) .. 12 (ás)
}

/** Avalia exatamente 5 cartas. */
function evaluate5(cards: Card[]): HandResult {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const suits = cards.map((c) => c[1]);
  const isFlush = suits.every((s) => s === suits[0]);

  // sequência (ás pode ser baixo: A-2-3-4-5)
  const unique = [...new Set(ranks)];
  let straightHigh = -1;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0];
    else if (unique[0] === 12 && unique[1] === 3 && unique[1] - unique[4] === 3) straightHigh = 3; // wheel
  }

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // ordena por (quantidade, rank) desc — define os desempates
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map(([, n]) => n).join('');

  let category: number;
  if (straightHigh >= 0 && isFlush) category = 8;
  else if (shape === '41') category = 7;
  else if (shape === '32') category = 6;
  else if (isFlush) category = 5;
  else if (straightHigh >= 0) category = 4;
  else if (shape === '311') category = 3;
  else if (shape === '221') category = 2;
  else if (shape === '2111') category = 1;
  else category = 0;

  // empacota: categoria + até 5 ranks de desempate em base 13
  const tiebreak =
    straightHigh >= 0 && (category === 4 || category === 8)
      ? [straightHigh]
      : groups.map(([r]) => r);
  let score = category;
  const padded = [...tiebreak, 0, 0, 0, 0, 0].slice(0, 5);
  for (const t of padded) score = score * 13 + t;
  return { score, name: HAND_NAMES[category] };
}

/** Melhor mão de 5 cartas entre as 7 (2 da mão + 5 comunitárias). */
export function evaluate7(cards: Card[]): HandResult {
  let best: HandResult = { score: -1, name: '' };
  for (let a = 0; a < 7; a++) {
    for (let b = a + 1; b < 7; b++) {
      const five = cards.filter((_, i) => i !== a && i !== b);
      const res = evaluate5(five);
      if (res.score > best.score) best = res;
    }
  }
  return best;
}
