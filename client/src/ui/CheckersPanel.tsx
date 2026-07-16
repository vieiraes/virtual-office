import { useState } from 'react';
import { CHECKERS_ZONE, isInZone, type CheckersCell } from '@vo/shared';
import { useStore } from '../store';
import { socket } from '../net/socket';

const PIECE_GLYPH: Record<Exclude<CheckersCell, ''>, string> = {
  w: '⛀',
  W: '⛁',
  b: '⛂',
  B: '⛃',
};

/**
 * Mesa de damas do lounge: 2 jogadores sentam (brancas e pretas), o resto
 * assiste. Movimento validado no servidor; clique na peça e depois no
 * destino. Sair da zona abandona a partida.
 */
export function CheckersPanel() {
  const players = useStore((s) => s.players);
  const selfId = useStore((s) => s.selfId);
  const view = useStore((s) => s.checkers);
  const [selected, setSelected] = useState<number | null>(null);

  const self = selfId ? players[selfId] : undefined;
  if (!self || !isInZone(self, CHECKERS_ZONE) || !view) return null;

  const mySide = view.white?.id === selfId ? 'w' : view.black?.id === selfId ? 'b' : null;
  const seated = mySide !== null;
  const bothSeated = view.white !== null && view.black !== null;
  const myTurn = seated && bothSeated && !view.winner && view.turn === mySide;

  function clickCell(idx: number) {
    if (!myTurn || !view) return;
    const piece = view.board[idx];
    if (piece && piece.toLowerCase() === mySide) {
      // meio de cadeia de captura: só a peça da cadeia pode ser selecionada
      if (view.chainFrom !== null && idx !== view.chainFrom) return;
      setSelected(idx === selected ? null : idx);
      return;
    }
    if (selected !== null && piece === '') {
      socket.emit('checkers-move', { from: selected, to: idx });
      setSelected(null);
    }
  }

  const turnLabel = view.winner
    ? `🏆 ${view.winner === 'w' ? view.white?.name ?? 'brancas' : view.black?.name ?? 'pretas'} venceu!`
    : !bothSeated
      ? 'aguardando oponente…'
      : `vez das ${view.turn === 'w' ? 'brancas ⚪' : 'pretas ⚫'}${myTurn ? ' — você!' : ''}`;

  return (
    <div className="game-panel checkers-panel">
      <div className="game-header">
        ⛀ Mesa de damas
        <span className="game-sub">
          ⚪ {view.white?.name ?? '(vago)'} vs ⚫ {view.black?.name ?? '(vago)'}
        </span>
      </div>

      <div className="checkers-status">{turnLabel}</div>

      <div className="checkers-board">
        {view.board.map((cell, idx) => {
          const x = idx % 8;
          const y = Math.floor(idx / 8);
          const dark = (x + y) % 2 === 1;
          return (
            <button
              key={idx}
              className={`checkers-cell ${dark ? 'dark' : 'light'} ${selected === idx ? 'selected' : ''} ${view.chainFrom === idx ? 'chain' : ''}`}
              onClick={() => clickCell(idx)}
              disabled={!dark}
            >
              {cell && (
                <span className={`checkers-piece ${cell.toLowerCase() === 'w' ? 'white' : 'black'}`}>
                  {PIECE_GLYPH[cell as Exclude<CheckersCell, ''>]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="game-actions">
        {!seated && !bothSeated && (
          <button className="game-btn primary" onClick={() => socket.emit('checkers-sit')}>
            🪑 Sentar ({view.white ? 'pretas ⚫' : 'brancas ⚪'})
          </button>
        )}
        {seated && (
          <>
            <button className="game-btn" onClick={() => socket.emit('checkers-reset')}>
              🔄 Reiniciar
            </button>
            <button className="game-btn" onClick={() => socket.emit('checkers-leave')}>
              🚪 Levantar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
