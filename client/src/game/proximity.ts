import { CONNECT_RADIUS, DISCONNECT_RADIUS, PROXIMITY_INTERVAL_MS } from '@vo/shared';
import { useStore } from '../store';

interface Point {
  x: number;
  y: number;
}

/**
 * Histerese: entra no set a <= CONNECT_RADIUS, só sai a >= DISCONNECT_RADIUS.
 * A folga entre os raios evita conectar/desconectar em loop quando alguém
 * fica parado exatamente na fronteira.
 *
 * Retorna o novo array de ids OU null se nada mudou (evita re-render/efeitos à toa).
 */
export function updateNearby(
  self: Point,
  others: Array<Point & { id: string }>,
  current: string[],
): string[] | null {
  const currentSet = new Set(current);
  const next: string[] = [];
  let changed = false;

  for (const other of others) {
    const d = Math.hypot(other.x - self.x, other.y - self.y);
    const wasNear = currentSet.has(other.id);
    const isNear = wasNear ? d < DISCONNECT_RADIUS : d <= CONNECT_RADIUS;
    if (isNear) next.push(other.id);
    if (isNear !== wasNear) changed = true;
  }

  // alguém do set atual sumiu da lista de others (saiu do escritório)
  if (!changed && next.length !== current.length) changed = true;

  return changed ? next.sort() : null;
}

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Roda fora do loop do Phaser de propósito: o Phaser pausa em abas em
 * background, mas quem está com a aba minimizada ainda precisa detectar
 * colegas chegando perto para iniciar/aceitar a chamada. setInterval é
 * throttled (~1s) em background, o que é suficiente.
 *
 * A posição própria vem do store (players[selfId]), atualizada pela cena a
 * cada envio de move — em background ninguém se move, então ela fica válida.
 */
export function startProximityLoop() {
  if (intervalId) return;
  intervalId = setInterval(() => {
    const { selfId, players, nearbyPeerIds, setNearby } = useStore.getState();
    if (!selfId) return;
    const self = players[selfId];
    if (!self) return;
    const others = Object.values(players).filter((p) => p.id !== selfId);
    const next = updateNearby(self, others, nearbyPeerIds);
    if (next) {
      console.log('[proximity]', next.join(', ') || '(ninguém)');
      setNearby(next);
    }
  }, PROXIMITY_INTERVAL_MS);
}
