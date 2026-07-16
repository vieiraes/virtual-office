import { useEffect, useState } from 'react';
import {
  CARD_STATUSES,
  CARD_STATUS_LABELS,
  HIDDEN_VOTE,
  POKER_VALUES,
  ROLE_EMOJI,
  SPRINT_STATUS_LABELS,
  WARROOM_COOLDOWN_MS,
  isInMeetingRoom,
  type CardStatus,
  type JiraCard,
  type SprintStatus,
} from '@vo/shared';
import { useStore } from '../store';
import { socket } from '../net/socket';

/**
 * Painel da sala de reunião: aparece para quem está fisicamente dentro da
 * sala (canto inferior direito do mapa) — e fica sempre disponível para o PO,
 * onde ele estiver, com botão de recolher/expandir. O PO cria sprints e
 * cards, entrega para cada pessoa, roda planning poker e pode convocar uma
 * war room (reunião de emergência) que avisa todos os logados; qualquer um
 * move o status do card (To Do → Em andamento → Concluído). A sprint mostra
 * o progresso e o PO a encerra quando concluída.
 */
export function MeetingPanel() {
  const players = useStore((s) => s.players);
  const selfId = useStore((s) => s.selfId);
  const selfRole = useStore((s) => s.selfRole);
  const room = useStore((s) => s.roomState);
  const [newTitle, setNewTitle] = useState('');
  const [newSprint, setNewSprint] = useState('');
  /** null = backlog. */
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [warroomCooldown, setWarroomCooldown] = useState(false);

  // painel some quando o PO sai da sala com o input focado — sem isso o
  // onBlur não dispara e o teclado do jogo ficaria preso
  useEffect(() => () => useStore.setState({ chatFocused: false }), []);

  // sprint selecionada foi apagada → volta para o backlog
  useEffect(() => {
    if (selectedSprintId !== null && !room.sprints.some((s) => s.id === selectedSprintId)) {
      setSelectedSprintId(null);
    }
  }, [room.sprints, selectedSprintId]);

  const self = selfId ? players[selfId] : undefined;
  const isPO = selfRole === 'po';
  // PO vê o painel de qualquer lugar do mapa; os demais só dentro da sala
  if (!self || (!isPO && !isInMeetingRoom(self))) return null;

  // recolhido: só a abinha na lateral para reabrir (não ocupa a tela do PO)
  if (isPO && collapsed) {
    return (
      <button
        className="meeting-collapsed-tab"
        title="Expandir painel da sala de reunião"
        onClick={() => setCollapsed(false)}
      >
        🗂️
      </button>
    );
  }

  const inRoom = Object.values(players).filter(isInMeetingRoom);
  const online = Object.values(players);
  const pokerCard = room.poker ? room.cards.find((c) => c.id === room.poker!.cardId) : null;

  const selectedSprint = room.sprints.find((s) => s.id === selectedSprintId) ?? null;
  const visibleCards = room.cards.filter((c) => c.sprintId === selectedSprintId);
  const doneCount = visibleCards.filter((c) => c.status === 'done').length;
  const progress = visibleCards.length > 0 ? doneCount / visibleCards.length : 0;

  function createCard(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    socket.emit('card-create', { title: newTitle.trim(), sprintId: selectedSprintId });
    setNewTitle('');
  }

  function createSprint(e: React.FormEvent) {
    e.preventDefault();
    if (!newSprint.trim()) return;
    socket.emit('sprint-create', { name: newSprint.trim() });
    setNewSprint('');
  }

  function revealedAverage(): string | null {
    if (!room.poker?.revealed) return null;
    const nums = Object.values(room.poker.votes)
      .map(Number)
      .filter((n) => !Number.isNaN(n));
    if (nums.length === 0) return null;
    return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1);
  }

  const avg = revealedAverage();

  function callWarRoom() {
    socket.emit('warroom-call');
    setWarroomCooldown(true);
    setTimeout(() => setWarroomCooldown(false), WARROOM_COOLDOWN_MS);
  }

  const focusProps = {
    onFocus: () => useStore.setState({ chatFocused: true }),
    onBlur: () => useStore.setState({ chatFocused: false }),
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
    },
  };

  return (
    <div className="meeting-panel">
      <div className="meeting-header">
        <div className="meeting-header-row">
          <span>🗂️ Sala de reunião</span>
          {isPO && (
            <span className="meeting-header-actions">
              <button
                className="warroom-btn"
                title="Convocar reunião de emergência: avisa todos os logados"
                disabled={warroomCooldown}
                onClick={callWarRoom}
              >
                🚨 War room
              </button>
              <button
                className="meeting-collapse-btn"
                title="Recolher painel"
                onClick={() => setCollapsed(true)}
              >
                ⏵
              </button>
            </span>
          )}
        </div>
        <span className="meeting-members">
          {inRoom.length > 0
            ? inRoom.map((p) => `${ROLE_EMOJI[p.role] ?? ''}${p.name}`).join(' · ')
            : 'ninguém na sala agora'}
        </span>
      </div>

      <div className="sprint-tabs">
        <button
          className={`sprint-tab ${selectedSprintId === null ? 'selected' : ''}`}
          onClick={() => setSelectedSprintId(null)}
        >
          📥 Backlog
        </button>
        {room.sprints.map((sprint) => (
          <button
            key={sprint.id}
            className={`sprint-tab ${selectedSprintId === sprint.id ? 'selected' : ''} ${sprint.status}`}
            onClick={() => setSelectedSprintId(sprint.id)}
          >
            {SPRINT_STATUS_LABELS[sprint.status].slice(0, 2)} {sprint.name}
          </button>
        ))}
      </div>

      {isPO && (
        <form className="chat-input-row sprint-create" onSubmit={createSprint}>
          <input
            value={newSprint}
            onChange={(e) => setNewSprint(e.target.value)}
            {...focusProps}
            placeholder="Nova sprint (ex: Sprint 12)…"
            maxLength={60}
          />
          <button type="submit" disabled={!newSprint.trim()}>＋</button>
        </form>
      )}

      {selectedSprint && (
        <div className="sprint-summary">
          <div className="sprint-summary-row">
            <span className={`sprint-status-badge ${selectedSprint.status}`}>
              {SPRINT_STATUS_LABELS[selectedSprint.status]}
            </span>
            <span className="sprint-progress-label">
              {visibleCards.length === 0
                ? 'sem cards'
                : `${doneCount}/${visibleCards.length} concluídos`}
            </span>
          </div>
          <div className="sprint-progress">
            <div className="sprint-progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          {visibleCards.length > 0 && doneCount === visibleCards.length && selectedSprint.status !== 'done' && (
            <div className="sprint-ready">🎉 Todos os cards concluídos — dá para encerrar a sprint!</div>
          )}
          {isPO && (
            <div className="sprint-po-actions">
              <select
                value={selectedSprint.status}
                onChange={(e) =>
                  socket.emit('sprint-status', {
                    sprintId: selectedSprint.id,
                    status: e.target.value as SprintStatus,
                  })
                }
              >
                {(Object.keys(SPRINT_STATUS_LABELS) as SprintStatus[]).map((st) => (
                  <option key={st} value={st}>
                    {SPRINT_STATUS_LABELS[st]}
                  </option>
                ))}
              </select>
              <button
                title="Excluir sprint (cards voltam ao backlog)"
                onClick={() => socket.emit('sprint-delete', { sprintId: selectedSprint.id })}
              >
                🗑️
              </button>
            </div>
          )}
        </div>
      )}

      {room.poker && pokerCard && (
        <div className="poker-box">
          <div className="poker-title">
            🃏 Planning poker: <strong>{pokerCard.title}</strong>
          </div>

          <div className="poker-votes">
            {inRoom.map((p) => {
              const vote = room.poker!.votes[p.id];
              return (
                <span key={p.id} className={`poker-voter ${vote ? 'voted' : ''}`}>
                  {p.name}: {vote === HIDDEN_VOTE ? '🂠' : vote ?? '…'}
                </span>
              );
            })}
          </div>

          {!room.poker.revealed && (
            <div className="poker-hand">
              {POKER_VALUES.map((v) => (
                <button
                  key={v}
                  className="poker-value"
                  onClick={() => socket.emit('poker-vote', { value: v })}
                >
                  {v}
                </button>
              ))}
            </div>
          )}

          {room.poker.revealed && avg && (
            <div className="poker-avg">média: {avg}</div>
          )}

          {isPO && (
            <div className="poker-po-actions">
              {!room.poker.revealed ? (
                <button onClick={() => socket.emit('poker-reveal')}>👁️ Revelar votos</button>
              ) : (
                <>
                  {avg && (
                    <button
                      onClick={() => {
                        socket.emit('card-points', {
                          cardId: pokerCard.id,
                          points: String(Math.round(Number(avg))),
                        });
                        socket.emit('poker-end');
                      }}
                    >
                      ✅ Aplicar ~{Math.round(Number(avg))} pts
                    </button>
                  )}
                  <button onClick={() => socket.emit('poker-end')}>Encerrar</button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="cards-list">
        {visibleCards.length === 0 && (
          <p className="chat-empty">
            {isPO
              ? 'Crie o primeiro card abaixo 👇'
              : selectedSprint
                ? 'Sprint sem cards ainda.'
                : 'Backlog vazio.'}
          </p>
        )}
        {visibleCards.map((card: JiraCard) => (
          <div
            key={card.id}
            className={`jira-card status-${card.status} ${card.assigneeId === selfId ? 'mine' : ''}`}
          >
            <div className="card-top">
              <span className="card-key">VO-{card.id}</span>
              <span className="card-top-right">
                {card.points && <span className="card-points">{card.points} pts</span>}
                <select
                  className={`card-status ${card.status}`}
                  value={card.status}
                  title="Status do card"
                  onChange={(e) =>
                    socket.emit('card-status', {
                      cardId: card.id,
                      status: e.target.value as CardStatus,
                    })
                  }
                >
                  {CARD_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {CARD_STATUS_LABELS[st]}
                    </option>
                  ))}
                </select>
              </span>
            </div>
            <div className="card-title">{card.title}</div>
            <div className="card-bottom">
              <span className="card-assignee">
                {card.assigneeName
                  ? `👤 ${card.assigneeName}${card.assigneeId === selfId ? ' (você)' : ''}`
                  : 'sem responsável'}
              </span>
              {isPO && (
                <span className="card-po-actions">
                  <select
                    value={card.assigneeId ?? ''}
                    onChange={(e) =>
                      socket.emit('card-assign', {
                        cardId: card.id,
                        assigneeId: e.target.value || null,
                      })
                    }
                  >
                    <option value="">— entregar para…</option>
                    {online.map((p) => (
                      <option key={p.id} value={p.id}>
                        {ROLE_EMOJI[p.role] ?? ''} {p.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={card.sprintId ?? ''}
                    title="Mover para sprint"
                    onChange={(e) =>
                      socket.emit('card-sprint', {
                        cardId: card.id,
                        sprintId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">📥 Backlog</option>
                    {room.sprints.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    title="Planning poker deste card"
                    onClick={() => socket.emit('poker-start', { cardId: card.id })}
                  >
                    🃏
                  </button>
                  <button
                    title="Excluir card"
                    onClick={() => socket.emit('card-delete', { cardId: card.id })}
                  >
                    🗑️
                  </button>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {isPO && (
        <form className="chat-input-row" onSubmit={createCard}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            {...focusProps}
            placeholder={
              selectedSprint
                ? `Novo card em ${selectedSprint.name}…`
                : 'Novo card no backlog…'
            }
            maxLength={120}
          />
          <button type="submit" disabled={!newTitle.trim()}>＋</button>
        </form>
      )}
    </div>
  );
}
