import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HOLDEM_BIG_BLIND,
  HOLDEM_BUYIN,
  HOLDEM_MAX_SEATS,
  HOLDEM_ZONE,
  isInZone,
  type Card,
  type HoldemSeatView,
} from '@vo/shared';
import { useStore } from '../store';
import { socket } from '../net/socket';

/** Níveis de blinds do torneio — escalam a cada BLIND_LEVEL_MS. */
const BLIND_LEVEL_MS = 8 * 60 * 1000; // 8 minutos por nível
const BLIND_LEVELS: { sb: number; bb: number }[] = [
  { sb: 2,  bb: 4   },
  { sb: 4,  bb: 8   },
  { sb: 6,  bb: 12  },
  { sb: 10, bb: 20  },
  { sb: 15, bb: 30  },
  { sb: 25, bb: 50  },
  { sb: 50, bb: 100 },
  { sb: 75, bb: 150 },
];

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

const SUIT_SYMBOL: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RANK_LABEL: Record<string, string> = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };

function PlayingCard({ card }: { card: Card | null }) {
  if (!card) return <span className="pcard back">🂠</span>;
  const rank = RANK_LABEL[card[0]] ?? card[0];
  const suit = SUIT_SYMBOL[card[1]] ?? card[1];
  const red = card[1] === 'h' || card[1] === 'd';
  return (
    <span className={`pcard ${red ? 'red' : ''}`}>
      {rank}
      {suit}
    </span>
  );
}

const STAGE_LABELS: Record<string, string> = {
  lobby: 'aguardando jogadores',
  preflop: 'pré-flop',
  flop: 'flop',
  turn: 'turn',
  river: 'river',
  showdown: 'showdown',
};

/** Ícone de ficha usando Unicode (⛁ pot / ⛀ seat). */
function ChipIcon({ compact, pot }: { compact?: boolean; pot?: boolean }) {
  return (
    <span
      style={{
        fontSize: compact ? '12px' : '16px',
        marginRight: '4px',
        color: pot ? '#f5c842' : '#c9a84c',
        verticalAlign: 'middle',
        lineHeight: 1,
      }}
    >
      {pot ? '⛁' : '⛀'}
    </span>
  );
}

/**
 * Mesa de Texas Hold'em do lounge: o painel aparece para quem está na zona
 * da mesa (até 6 lugares). Ao sentar, vira uma mesa grande centralizada para
 * jogar confortavelmente — dá para reduzir de volta ao painel compacto.
 * Fichas fictícias com recompra automática; afastar da mesa vale como fold.
 * As cartas dos outros só aparecem no showdown.
 */
export function HoldemPanel() {
  const players = useStore((s) => s.players);
  const selfId = useStore((s) => s.selfId);
  const view = useStore((s) => s.holdem);
  const [raiseBy, setRaiseBy] = useState(2 * HOLDEM_BIG_BLIND);
  const [big, setBig] = useState(false);

  // ── blind timer ──────────────────────────────────────────────────────────
  const [gameStartTime, setGameStartTime] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const prevStageRef = useRef<string>('lobby');
  const [showDeal, setShowDeal] = useState(false);
  const [localMuck, setLocalMuck] = useState(false);

  useEffect(() => {
    const prev = prevStageRef.current;
    const cur = view?.stage ?? 'lobby';

    // Primeira mão inicia: dispara animação e zera o timer
    if (prev === 'lobby' && cur === 'preflop') {
      setShowDeal(true);
      setTimeout(() => setShowDeal(false), 2200);
      if (!gameStartTime) setGameStartTime(Date.now());
    }
    
    // Nova mão sempre zera o estado local de muck
    if (prev !== 'preflop' && cur === 'preflop') {
      setLocalMuck(false);
    }
    
    prevStageRef.current = cur;
  }, [view?.stage]);

  useEffect(() => {
    if (!gameStartTime && !view?.nextHandAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [gameStartTime, view?.nextHandAt]);

  const elapsed     = gameStartTime ? now - gameStartTime : 0;
  // clamp em 0: "now" (state) pode ficar defasado em relação a gameStartTime
  // por até 1 tick do setInterval logo que a mão começa, dando elapsed
  // negativo — sem o max(0, ...), BLIND_LEVELS[-1] é undefined e quebra
  // o componente inteiro (sem error boundary) toda vez que uma mão inicia.
  const levelIdx    = Math.max(0, Math.min(Math.floor(elapsed / BLIND_LEVEL_MS), BLIND_LEVELS.length - 1));
  const levelRemMs  = BLIND_LEVEL_MS - (elapsed % BLIND_LEVEL_MS);
  const curBlinds   = BLIND_LEVELS[levelIdx];
  const nextBlinds  = BLIND_LEVELS[Math.min(levelIdx + 1, BLIND_LEVELS.length - 1)];
  const nearEnd     = levelRemMs < 60_000; // último minuto → destaque vermelho
  // ─────────────────────────────────────────────────────────────────────────

  // ── aviso de turno: dá pra perceber "é sua vez" mesmo com o painel recolhido
  // e a atenção em outro lugar do escritório (mapa, chat, reunião) ──────────
  const mySeatNow = view?.seats.find((s) => s.id === selfId);
  const isMyTurn = Boolean(
    view && mySeatNow && view.turnId === selfId && !mySeatNow.folded && !mySeatNow.allIn,
  );

  useEffect(() => {
    if (!isMyTurn) return;
    const original = document.title;
    let flip = false;
    const id = setInterval(() => {
      flip = !flip;
      document.title = flip ? '🃏 Sua vez! · Virtual Office' : original;
    }, 1000);
    return () => {
      clearInterval(id);
      document.title = original;
    };
  }, [isMyTurn]);

  // corrige o raise travado: se alguém re-raiza antes da sua vez, o mínimo
  // sobe e o valor digitado precisa acompanhar (senão o botão fica desabilitado
  // sem nenhuma explicação na tela)
  useEffect(() => {
    if (view) setRaiseBy((prev) => Math.max(prev, view.minRaise));
  }, [view?.minRaise]);

  // aviso de recompra automática: fichas foram a zero e voltaram pro buy-in
  // ao começar a próxima mão — sem isso parece bug ("cadê minhas fichas?")
  const lastSeenChipsRef = useRef<number | null>(null);
  const [showRebuyToast, setShowRebuyToast] = useState(false);
  useEffect(() => {
    if (!mySeatNow) return;
    const prevChips = lastSeenChipsRef.current;
    lastSeenChipsRef.current = mySeatNow.chips;
    if (prevChips === 0 && mySeatNow.chips > 0 && view?.stage === 'preflop') {
      setShowRebuyToast(true);
      const t = setTimeout(() => setShowRebuyToast(false), 4000);
      return () => clearTimeout(t);
    }
  }, [mySeatNow?.chips]);

  // confirmação de 2 cliques pra ações difíceis de desfazer (All-in / Levantar
  // no meio de uma mão) — 1º clique só pede confirmação, 2º clique executa
  const [pendingConfirm, setPendingConfirm] = useState<'allin' | 'leave' | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ─────────────────────────────────────────────────────────────────────────

  const self = selfId ? players[selfId] : undefined;
  if (!self || !isInZone(self, HOLDEM_ZONE) || !view) return null;

  const mySeat = mySeatNow;
  const expanded = Boolean(mySeat) && big;
  const myTurn = isMyTurn && mySeat;
  const toCall = mySeat ? view.currentBet - mySeat.bet : 0;
  const maxRaise = mySeat ? Math.max(view.minRaise, mySeat.chips - toCall) : view.minRaise;
  const clampRaise = (n: number) => Math.min(maxRaise, Math.max(view.minRaise, Math.round(n)));
  const betting = ['preflop', 'flop', 'turn', 'river'].includes(view.stage);
  
  const canShowMuck =
    view.stage === 'showdown' &&
    mySeat?.inHand &&
    !mySeat?.showingCards &&
    !localMuck;
  const nextHandRemMs = view.nextHandAt ? Math.max(0, view.nextHandAt - now) : 0;

  // 1º clique arma a confirmação (some sozinha em 2.5s); 2º clique dentro
  // da janela executa a ação de fato
  function confirmableAction(kind: 'allin' | 'leave', action: () => void) {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    if (pendingConfirm === kind) {
      setPendingConfirm(null);
      action();
      return;
    }
    setPendingConfirm(kind);
    confirmTimerRef.current = setTimeout(() => setPendingConfirm(null), 2500);
  }

  const liveMessage = myTurn
    ? 'É a sua vez de agir.'
    : view.winners
      ? `Mão encerrada. ${view.winners
          .map((w) => `${w.name} venceu ${w.amount} fichas com ${w.hand}`)
          .join('. ')}`
      : view.stage !== 'lobby'
        ? `Etapa da mão: ${STAGE_LABELS[view.stage]}.`
        : '';

  // mesa radial (modo ampliado): gira a lista de assentos pra você sempre
  // aparecer embaixo (posição 0) — mantém a ordem relativa (= ordem de turno)
  // dos demais, só reindexa o ponto de partida.
  const orderedSeats = (() => {
    if (!mySeat) return view.seats;
    const idx = view.seats.findIndex((s) => s.id === selfId);
    if (idx <= 0) return view.seats;
    return [...view.seats.slice(idx), ...view.seats.slice(0, idx)];
  })();

  function radialPos(i: number, n: number): React.CSSProperties {
    const angle = Math.PI / 2 - (i / n) * 2 * Math.PI;
    const left = 50 + 42 * Math.cos(angle);
    const top = 50 + 38 * Math.sin(angle);
    return { left: `${left}%`, top: `${top}%` };
  }

  function radialSeat(seat: HoldemSeatView, i: number, n: number) {
    const isTurn = view!.turnId === seat.id;
    const dealer = view!.dealerId === seat.id;
    return (
      <div
        key={seat.id}
        className={`holdem-radial-seat ${isTurn ? 'turn' : ''} ${seat.folded ? 'folded' : ''} ${seat.id === selfId ? 'self' : ''}`}
        style={radialPos(i, n)}
      >
        <span className="holdem-radial-name">
          {dealer && <span title="dealer">🔘</span>} {seat.name}
        </span>
        <span className="holdem-radial-cards">
          {seat.cards === null ? (
            <>
              <PlayingCard card={null} />
              <PlayingCard card={null} />
            </>
          ) : (
            seat.cards.map((c) => <PlayingCard key={c} card={c} />)
          )}
        </span>
        <span className="holdem-radial-chips">
          <ChipIcon compact /> {seat.chips}
          {seat.bet > 0 && <span className="holdem-bet"> · {seat.bet}</span>}
        </span>
        {(seat.allIn || seat.folded) && (
          <span className="holdem-radial-status">{seat.allIn ? 'ALL-IN' : 'foldou'}</span>
        )}
      </div>
    );
  }

  function seatLine(seat: HoldemSeatView) {
    const isTurn = view!.turnId === seat.id;
    const dealer = view!.dealerId === seat.id;
    return (
      <div key={seat.id} className={`holdem-seat ${isTurn ? 'turn' : ''} ${seat.folded ? 'folded' : ''}`}>
        <span className="holdem-seat-name">
          {dealer && <span title="dealer">🔘 </span>}
          {seat.name}
          {seat.id === selfId ? ' (você)' : ''}
        </span>
        <span className="holdem-seat-cards">
          {seat.cards === null ? (
            <>
              <PlayingCard card={null} />
              <PlayingCard card={null} />
            </>
          ) : (
            seat.cards.map((c) => <PlayingCard key={c} card={c} />)
          )}
        </span>
        <span className="holdem-seat-chips">
          <ChipIcon compact /> {seat.chips}
          {seat.bet > 0 && <span className="holdem-bet"> · aposta <ChipIcon compact /> {seat.bet}</span>}
          {seat.allIn && ' · ALL-IN'}
          {seat.folded && ' · foldou'}
        </span>
      </div>
    );
  }

  const communityInner = (
    <>
      {/* animação de início de mão */}
      {showDeal && (
        <div className="holdem-deal-anim">
          <span className="deal-card-anim">🂠</span>
          <span className="deal-card-anim" style={{ animationDelay: '0.18s' }}>🂠</span>
          <span className="deal-title">Distribuindo cartas…</span>
        </div>
      )}

      <div className="holdem-community-cards">
        {view.community.map((c, idx) => (
          <span key={c} style={{ '--idx': idx } as React.CSSProperties}>
            <PlayingCard card={c} />
          </span>
        ))}
        {view.community.length === 0 && betting && (
          <span className="chat-empty">cartas no flop…</span>
        )}
      </div>

      <div className="holdem-mesa-info">
        {view.pot > 0 && (
          <div className="holdem-pot">
            <ChipIcon pot />
            <span className="holdem-pot-label">POT</span>
            <span className="holdem-pot-value">{view.pot}</span>
          </div>
        )}

        {gameStartTime !== null && (
          <div className={`holdem-blind-timer ${nearEnd ? 'near-end' : ''}`}>
            <div className="blind-level-row">
              <span className="blind-label">Nível {levelIdx + 1}</span>
              <span className="blind-values">
                SB <strong>{curBlinds.sb}</strong> / BB <strong>{curBlinds.bb}</strong>
              </span>
            </div>
            <div className="blind-countdown-row">
              <span className="blind-countdown-label">próximo nível</span>
              <span className={`blind-countdown ${nearEnd ? 'blink' : ''}`}>
                {fmtTime(levelRemMs)}
              </span>
              {levelIdx < BLIND_LEVELS.length - 1 && (
                <span className="blind-next">
                  → {nextBlinds.sb}/{nextBlinds.bb}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );

  const panelContent = (
    <div className={`game-panel holdem-panel ${expanded ? 'expanded' : ''}`}>
      <div aria-live="polite" className="sr-only">
        {liveMessage}
      </div>

      {showRebuyToast && (
        <div className="holdem-rebuy-toast">💸 Recompra automática: +{HOLDEM_BUYIN} fichas</div>
      )}

      <div className="game-header">
        <div className="game-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🃏 Mesa de poker</span>
            {view.stage !== 'lobby' && (
              <span className={`holdem-stage-pill stage-${view.stage}`}>
                {STAGE_LABELS[view.stage]}
              </span>
            )}
            {myTurn && (
              <span className="holdem-turn-badge" role="status">
                🎯 sua vez
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="game-sub" style={{ margin: 0 }}>
              {view.seats.length}/{HOLDEM_MAX_SEATS} lugares
            </span>
            {mySeat && (
              <button
                className="game-size-btn"
                title={big ? 'Reduzir mesa' : 'Ampliar mesa'}
                onClick={() => setBig(!big)}
              >
                {big ? '🗕 Reduzir' : '🗖 Ampliar'}
              </button>
            )}
          </div>
        </div>
      </div>

      {expanded ? (
        <div className="holdem-table-oval">
          <div className="holdem-table-center">{communityInner}</div>
          {orderedSeats.map((seat, i) => radialSeat(seat, i, orderedSeats.length))}
        </div>
      ) : (
        <div className="holdem-community">{communityInner}</div>
      )}

      {mySeat && mySeat.cards && mySeat.cards.length > 0 && (
        <div className={`holdem-my-hand ${mySeat.folded ? 'folded' : ''}`}>
          <span className="holdem-my-hand-label">sua mão</span>
          <span className="holdem-my-hand-cards">
            {mySeat.cards.map((c) => (
              <PlayingCard key={c} card={c} />
            ))}
          </span>
          {mySeat.folded && <span className="holdem-my-hand-tag">foldou</span>}
        </div>
      )}

      {view.winners && (
        <div className="holdem-winners">
          {view.winners.map((w) => (
            <div key={w.id}>
              🏆 <strong>{w.name}</strong> leva {w.amount} ({w.hand})
            </div>
          ))}
          
          {canShowMuck && (
            <div className="holdem-show-muck">
              <button
                className="btn-show-cards"
                onClick={() => socket.emit('holdem-action', { action: 'showCards' })}
              >
                👀 Mostrar Cartas
              </button>
              <button
                className="btn-muck-cards"
                onClick={() => setLocalMuck(true)}
              >
                ❌ Esconder
              </button>
            </div>
          )}

          {view.nextHandAt !== null && (
            <div className="game-sub holdem-next-hand">
              próxima mão em <span className="holdem-next-hand-time">{fmtTime(nextHandRemMs)}</span>
            </div>
          )}
        </div>
      )}

      {!expanded && (
        <div className="holdem-seats">
          {view.seats.length === 0 && <p className="chat-empty">Mesa vazia — sente-se!</p>}
          {view.seats.map(seatLine)}
        </div>
      )}

      <div className="game-actions">
        {!mySeat && view.seats.length < HOLDEM_MAX_SEATS && (
          <button className="game-btn primary" onClick={() => socket.emit('holdem-sit')}>
            🪑 Sentar (500 fichas)
          </button>
        )}
        {mySeat && view.stage === 'lobby' && (
          <button
            className="game-btn primary"
            disabled={view.seats.length < 2}
            onClick={() => socket.emit('holdem-start')}
          >
            ▶️ Iniciar mão {view.seats.length < 2 ? '(precisa de 2+)' : ''}
          </button>
        )}
        {myTurn && (
          <>
            <button
              className="game-btn"
              onClick={() => socket.emit('holdem-action', { action: 'fold' })}
            >
              Fold
            </button>
            {toCall === 0 ? (
              <button
                className="game-btn"
                onClick={() => socket.emit('holdem-action', { action: 'check' })}
              >
                Check
              </button>
            ) : (
              <button
                className="game-btn"
                onClick={() => socket.emit('holdem-action', { action: 'call' })}
              >
                Call {Math.min(toCall, mySeat.chips)}
              </button>
            )}
            <span className="holdem-raise">
              <span className="holdem-raise-presets">
                <button
                  type="button"
                  className="raise-preset-btn"
                  onClick={() => setRaiseBy(clampRaise(view.pot / 2))}
                >
                  ½ pote
                </button>
                <button
                  type="button"
                  className="raise-preset-btn"
                  onClick={() => setRaiseBy(clampRaise(view.pot))}
                >
                  pote
                </button>
                <button
                  type="button"
                  className="raise-preset-btn"
                  onClick={() => setRaiseBy(maxRaise)}
                >
                  max
                </button>
              </span>
              <span className="holdem-raise-input-group">
                <input
                  type="number"
                  min={view.minRaise}
                  max={maxRaise}
                  step={HOLDEM_BIG_BLIND}
                  value={raiseBy}
                  onChange={(e) => setRaiseBy(Number(e.target.value))}
                />
                <button
                  className="game-btn"
                  disabled={raiseBy < view.minRaise}
                  onClick={() => socket.emit('holdem-action', { action: 'raise', amount: raiseBy })}
                >
                  Raise +{raiseBy}
                </button>
              </span>
              <span className="holdem-raise-hint">mín. {view.minRaise}</span>
            </span>
            <button
              className={`game-btn danger ${pendingConfirm === 'allin' ? 'confirm-pending' : ''}`}
              onClick={() =>
                confirmableAction('allin', () => socket.emit('holdem-action', { action: 'allin' }))
              }
            >
              {pendingConfirm === 'allin' ? 'Confirmar all-in?' : 'All-in'}
            </button>
          </>
        )}
        {mySeat && (
          <button
            className={`game-btn ${pendingConfirm === 'leave' ? 'confirm-pending' : ''}`}
            onClick={() => {
              const leave = () => socket.emit('holdem-leave');
              if (mySeat.inHand && betting) confirmableAction('leave', leave);
              else leave();
            }}
          >
            {pendingConfirm === 'leave' ? 'Confirmar — perde a mão?' : '🚪 Levantar'}
          </button>
        )}
      </div>
      {mySeat && betting && !myTurn && (
        <div className="game-sub game-waiting">
          aguardando {view.seats.find((s) => s.id === view.turnId)?.name ?? '…'}
        </div>
      )}
    </div>
  );

  if (expanded) {
    return createPortal(
      <>
        <div className="holdem-overlay" onClick={() => setBig(false)} />
        {panelContent}
      </>,
      document.body,
    );
  }

  return panelContent;
}
