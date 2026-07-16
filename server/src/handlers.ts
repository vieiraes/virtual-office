import type { Server, Socket } from 'socket.io';
import type {
  CardStatus,
  ChatSendPayload,
  HoldemAction,
  JoinAck,
  JoinPayload,
  MediaStatePayload,
  MovePayload,
  Player,
  SignalIce,
  SignalOffer,
  SprintStatus,
} from '@vo/shared';
import {
  CARD_STATUSES,
  CHECKERS_ZONE,
  HOLDEM_ZONE,
  POKER_VALUES,
  WARROOM_COOLDOWN_MS,
  isInZone,
} from '@vo/shared';
import {
  allocCardId,
  allocSprintId,
  persistBoard,
  pickSpawn,
  players,
  room,
  roomSnapshot,
} from './state.js';
import { HoldemGame } from './games/holdem.js';
import { CheckersGame } from './games/checkers.js';

const SPRINT_STATUSES: SprintStatus[] = ['planned', 'active', 'done'];

export function registerHandlers(io: Server) {
  // ---------- mesas de jogo do lounge ----------
  // cartas dos outros são secretas → cada socket recebe a própria view
  const broadcastHoldem = () => {
    for (const [id, s] of io.of('/').sockets) s.emit('holdem-state', holdem.view(id));
  };
  const holdem = new HoldemGame(broadcastHoldem);
  const checkers = new CheckersGame(() => io.emit('checkers-state', checkers.view()));

  // última convocação de war room (compartilhada entre todos os POs)
  let lastWarRoomAt = 0;

  io.on('connection', (socket: Socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    socket.on('join', (payload: JoinPayload, ack: (res: JoinAck) => void) => {
      const spawn = pickSpawn();
      const role = ['dev', 'qa', 'po'].includes(payload.role) ? payload.role : 'dev';
      const player: Player = {
        id: socket.id,
        name: String(payload.name ?? 'Anônimo').slice(0, 24),
        color: payload.color,
        role,
        x: spawn.x,
        y: spawn.y,
        dir: 'down',
        moving: false,
        micOn: true,
        camOn: false, // câmera sempre começa desligada
      };
      players.set(socket.id, player);
      ack({ selfId: socket.id, players: [...players.values()], room: roomSnapshot() });
      socket.emit('holdem-state', holdem.view(socket.id));
      socket.emit('checkers-state', checkers.view());
      socket.broadcast.emit('player-joined', player);
      console.log(`[join] ${player.name} (${socket.id}) — ${players.size} online`);
    });

    socket.on('move', (payload: MovePayload) => {
      const player = players.get(socket.id);
      if (!player) return;
      player.x = payload.x;
      player.y = payload.y;
      player.dir = payload.dir;
      player.moving = payload.moving;
      socket.broadcast.emit('player-moved', { id: socket.id, ...payload });
      // afastou da mesa de jogo → levanta (no poker vale como fold)
      if (holdem.hasSeat(socket.id) && !isInZone(player, HOLDEM_ZONE)) holdem.leave(socket.id);
      if (checkers.hasSeat(socket.id) && !isInZone(player, CHECKERS_ZONE)) {
        checkers.leave(socket.id);
      }
    });

    socket.on('media-state', ({ micOn, camOn }: MediaStatePayload) => {
      const player = players.get(socket.id);
      if (!player) return;
      player.micOn = Boolean(micOn);
      player.camOn = Boolean(camOn);
      socket.broadcast.emit('player-media', {
        id: socket.id,
        micOn: player.micOn,
        camOn: player.camOn,
      });
    });

    // chat de texto restrito ao círculo de conversa: o client manda a lista
    // de peers próximos e o servidor só repassa para eles
    socket.on('chat', ({ to, text }: ChatSendPayload) => {
      if (!players.has(socket.id) || !Array.isArray(to)) return;
      const clean = String(text ?? '').trim().slice(0, 500);
      if (!clean) return;
      for (const id of to.slice(0, 20)) {
        io.to(id).emit('chat', { from: socket.id, text: clean });
      }
    });

    // ---------- sala de reunião: sprints + cards + planning poker ----------

    const isPO = () => players.get(socket.id)?.role === 'po';
    const broadcastRoom = () => io.emit('room-state', roomSnapshot());
    const boardChanged = () => {
      persistBoard();
      broadcastRoom();
    };

    socket.on('sprint-create', ({ name }: { name: string }) => {
      const clean = String(name ?? '').trim().slice(0, 60);
      if (!isPO() || !clean) return;
      room.sprints.push({ id: allocSprintId(), name: clean, status: 'planned' });
      boardChanged();
    });

    socket.on('sprint-status', ({ sprintId, status }: { sprintId: number; status: SprintStatus }) => {
      if (!isPO() || !SPRINT_STATUSES.includes(status)) return;
      const sprint = room.sprints.find((s) => s.id === sprintId);
      if (!sprint) return;
      sprint.status = status;
      boardChanged();
    });

    socket.on('sprint-delete', ({ sprintId }: { sprintId: number }) => {
      if (!isPO()) return;
      if (!room.sprints.some((s) => s.id === sprintId)) return;
      room.sprints = room.sprints.filter((s) => s.id !== sprintId);
      // cards da sprint apagada voltam para o backlog
      for (const card of room.cards) {
        if (card.sprintId === sprintId) card.sprintId = null;
      }
      boardChanged();
    });

    socket.on('card-create', ({ title, sprintId }: { title: string; sprintId?: number | null }) => {
      const clean = String(title ?? '').trim().slice(0, 120);
      if (!isPO() || !clean) return;
      const sprint = room.sprints.find((s) => s.id === sprintId);
      room.cards.push({
        id: allocCardId(),
        title: clean,
        sprintId: sprint?.id ?? null,
        status: 'todo',
        assigneeId: null,
        assigneeName: null,
        points: null,
      });
      boardChanged();
    });

    // qualquer um move o status — dev marca o próprio card como concluído
    socket.on('card-status', ({ cardId, status }: { cardId: number; status: CardStatus }) => {
      if (!players.has(socket.id) || !CARD_STATUSES.includes(status)) return;
      const card = room.cards.find((c) => c.id === cardId);
      if (!card) return;
      card.status = status;
      boardChanged();
    });

    socket.on('card-sprint', ({ cardId, sprintId }: { cardId: number; sprintId: number | null }) => {
      if (!isPO()) return;
      const card = room.cards.find((c) => c.id === cardId);
      if (!card) return;
      card.sprintId = room.sprints.find((s) => s.id === sprintId)?.id ?? null;
      boardChanged();
    });

    socket.on('card-assign', ({ cardId, assigneeId }: { cardId: number; assigneeId: string | null }) => {
      if (!isPO()) return;
      const card = room.cards.find((c) => c.id === cardId);
      if (!card) return;
      const assignee = assigneeId ? players.get(assigneeId) : undefined;
      card.assigneeId = assignee?.id ?? null;
      card.assigneeName = assignee?.name ?? null;
      boardChanged();
    });

    socket.on('card-points', ({ cardId, points }: { cardId: number; points: string | null }) => {
      if (!isPO()) return;
      const card = room.cards.find((c) => c.id === cardId);
      if (!card) return;
      card.points = points === null ? null : String(points).slice(0, 4);
      boardChanged();
    });

    socket.on('card-delete', ({ cardId }: { cardId: number }) => {
      if (!isPO()) return;
      room.cards = room.cards.filter((c) => c.id !== cardId);
      if (room.poker?.cardId === cardId) room.poker = null;
      boardChanged();
    });

    socket.on('poker-start', ({ cardId }: { cardId: number }) => {
      if (!isPO() || !room.cards.some((c) => c.id === cardId)) return;
      room.poker = { cardId, revealed: false, votes: {} };
      broadcastRoom();
    });

    socket.on('poker-vote', ({ value }: { value: string }) => {
      if (!room.poker || room.poker.revealed) return;
      if (!players.has(socket.id)) return;
      if (!(POKER_VALUES as readonly string[]).includes(value)) return;
      room.poker.votes[socket.id] = value;
      broadcastRoom();
    });

    socket.on('poker-reveal', () => {
      if (!isPO() || !room.poker) return;
      room.poker.revealed = true;
      broadcastRoom();
    });

    socket.on('poker-end', () => {
      if (!isPO() || !room.poker) return;
      room.poker = null;
      broadcastRoom();
    });

    // war room: PO convoca todos os logados para a sala de reunião
    socket.on('warroom-call', () => {
      const player = players.get(socket.id);
      if (!player || player.role !== 'po') return;
      const now = Date.now();
      if (now - lastWarRoomAt < WARROOM_COOLDOWN_MS) return;
      lastWarRoomAt = now;
      io.emit('warroom', { fromName: player.name });
      console.log(`[warroom] convocada por ${player.name}`);
    });

    // ---------- lounge: Texas Hold'em ----------

    socket.on('holdem-sit', () => {
      const player = players.get(socket.id);
      if (!player || !isInZone(player, HOLDEM_ZONE)) return;
      holdem.sit(socket.id, player.name);
    });

    socket.on('holdem-leave', () => holdem.leave(socket.id));

    socket.on('holdem-start', () => holdem.startHand(socket.id));

    socket.on('holdem-action', ({ action, amount }: { action: HoldemAction; amount?: number }) => {
      holdem.act(socket.id, action, Number(amount) || undefined);
    });

    // ---------- lounge: damas ----------

    socket.on('checkers-sit', () => {
      const player = players.get(socket.id);
      if (!player || !isInZone(player, CHECKERS_ZONE)) return;
      checkers.sit(socket.id, player.name);
    });

    socket.on('checkers-leave', () => checkers.leave(socket.id));

    socket.on('checkers-move', ({ from, to }: { from: number; to: number }) => {
      checkers.move(socket.id, Number(from), Number(to));
    });

    socket.on('checkers-reset', () => checkers.reset(socket.id));

    socket.on('webrtc-offer', ({ to, sdp }: SignalOffer) => {
      io.to(to).emit('webrtc-offer', { from: socket.id, sdp });
    });

    socket.on('webrtc-answer', ({ to, sdp }: SignalOffer) => {
      io.to(to).emit('webrtc-answer', { from: socket.id, sdp });
    });

    socket.on('webrtc-ice', ({ to, candidate }: SignalIce) => {
      io.to(to).emit('webrtc-ice', { from: socket.id, candidate });
    });

    socket.on('disconnect', () => {
      holdem.leave(socket.id);
      checkers.leave(socket.id);
      if (players.delete(socket.id)) {
        socket.broadcast.emit('player-left', { id: socket.id });
        console.log(`[leave] ${socket.id} — ${players.size} online`);
      }
      if (room.poker && socket.id in room.poker.votes) {
        delete room.poker.votes[socket.id];
        broadcastRoom();
      }
    });
  });
}
