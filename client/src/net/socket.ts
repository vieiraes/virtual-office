import { io, type Socket } from 'socket.io-client';
import type {
  ChatInPayload,
  CheckersView,
  HoldemView,
  JoinAck,
  MovePayload,
  Player,
  PlayerMediaPayload,
  PlayerMovedPayload,
  Role,
  RoomState,
} from '@vo/shared';
import { useStore } from '../store';

// Mesma origem: em dev o Vite faz proxy de /socket.io para :3001; em prod é o próprio Express.
export const socket: Socket = io();

socket.on('player-joined', (player: Player) => {
  useStore.getState().upsertPlayer(player);
});

socket.on('player-moved', ({ id, ...patch }: PlayerMovedPayload) => {
  useStore.getState().patchPlayer(id, patch);
});

socket.on('player-left', ({ id }: { id: string }) => {
  useStore.getState().removePlayer(id);
});

socket.on('player-media', ({ id, micOn, camOn }: PlayerMediaPayload) => {
  useStore.getState().patchPlayer(id, { micOn, camOn });
});

socket.on('room-state', (room: RoomState) => {
  useStore.setState({ roomState: room });
});

socket.on('holdem-state', (holdem: HoldemView) => {
  useStore.setState({ holdem });
});

socket.on('checkers-state', (checkers: CheckersView) => {
  useStore.setState({ checkers });
});

socket.on('chat', ({ from, text }: ChatInPayload) => {
  const { players, addChatMessage } = useStore.getState();
  addChatMessage({
    fromId: from,
    fromName: players[from]?.name ?? '???',
    text,
    self: false,
  });
});

/** O servidor assume mic on / cam off no join; sincroniza caso difira (ex: reconexão). */
function syncMediaState() {
  const { micOn, camOn, spectator } = useStore.getState();
  if (!spectator && (!micOn || camOn)) {
    socket.emit('media-state', { micOn, camOn });
  }
}

// Reconexão: o socket.id muda, então re-entra com o mesmo nome/cor e
// recebe um snapshot novo do escritório.
socket.on('connect', () => {
  const s = useStore.getState();
  if (s.phase === 'office' && s.selfName) {
    socket.emit(
      'join',
      { name: s.selfName, color: s.selfColor, role: s.selfRole },
      (ack: JoinAck) => {
        useStore.getState().setJoined(ack.selfId, ack.players);
        useStore.setState({ roomState: ack.room });
        syncMediaState();
      },
    );
  }
});

export function joinOffice(name: string, color: string, role: Role) {
  useStore.setState({ selfName: name, selfColor: color, selfRole: role });
  socket.emit('join', { name, color, role }, (ack: JoinAck) => {
    useStore.getState().setJoined(ack.selfId, ack.players);
    useStore.setState({ roomState: ack.room });
    syncMediaState();
  });
}

/** Envia texto só para quem está no círculo de conversa atual. */
export function sendChat(text: string) {
  const { selfId, selfName, nearbyPeerIds, addChatMessage } = useStore.getState();
  const clean = text.trim().slice(0, 500);
  if (!clean || !selfId || nearbyPeerIds.length === 0) return;
  socket.emit('chat', { to: nearbyPeerIds, text: clean });
  addChatMessage({ fromId: selfId, fromName: selfName, text: clean, self: true });
}

export function sendMove(payload: MovePayload) {
  socket.emit('move', payload);
}
