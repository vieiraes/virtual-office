import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { CheckersView, HoldemView, Player, Role, RoomState } from '@vo/shared';

export type Phase = 'join' | 'office';

export interface ChatMessage {
  id: number;
  fromId: string;
  fromName: string;
  text: string;
  self: boolean;
}

let nextChatId = 1;

interface Store {
  phase: Phase;
  selfId: string | null;
  selfName: string;
  selfColor: string;
  selfRole: Role;
  /** Sprints, cards e planning poker da sala de reunião (estado vem do servidor). */
  roomState: RoomState;
  /** Mesa de Texas Hold'em do lounge — view pessoal (cartas dos outros mascaradas). */
  holdem: HoldemView | null;
  /** Mesa de damas do lounge. */
  checkers: CheckersView | null;
  /** Todos os jogadores online, incluindo o próprio (fonte: servidor). */
  players: Record<string, Player>;
  /** Peers dentro do raio de conexão (saída da histerese de proximidade). */
  nearbyPeerIds: string[];
  remoteStreams: Record<string, MediaStream>;
  micOn: boolean;
  /** Sempre começa false: a câmera nunca abre sozinha ao se aproximar. */
  camOn: boolean;
  /** true quando getUserMedia falhou/foi negado — entra sem publicar mídia. */
  spectator: boolean;
  /** Chat do círculo de conversa (só chega de quem estava próximo ao enviar). */
  chatMessages: ChatMessage[];
  /** Input do chat focado — a cena desliga o teclado do jogo para não andar digitando. */
  chatFocused: boolean;
  /** Convocação de war room ativa (banner); null = nenhuma. */
  warroom: { fromName: string; at: number } | null;

  setJoined: (selfId: string, players: Player[]) => void;
  addChatMessage: (msg: Omit<ChatMessage, 'id'>) => void;
  upsertPlayer: (player: Player) => void;
  patchPlayer: (id: string, patch: Partial<Player>) => void;
  removePlayer: (id: string) => void;
  setNearby: (ids: string[]) => void;
  setRemoteStream: (peerId: string, stream: MediaStream) => void;
  removeRemoteStream: (peerId: string) => void;
}

export const useStore = create<Store>()(
  subscribeWithSelector((set) => ({
    phase: 'join',
    selfId: null,
    selfName: '',
    selfColor: '',
    selfRole: 'dev',
    roomState: { sprints: [], cards: [], poker: null },
    holdem: null,
    checkers: null,
    players: {},
    nearbyPeerIds: [],
    remoteStreams: {},
    micOn: true,
    camOn: false,
    spectator: false,
    chatMessages: [],
    chatFocused: false,
    warroom: null,

    setJoined: (selfId, playerList) =>
      set({
        phase: 'office',
        selfId,
        players: Object.fromEntries(playerList.map((p) => [p.id, p])),
      }),

    addChatMessage: (msg) =>
      set((s) => ({
        chatMessages: [...s.chatMessages, { ...msg, id: nextChatId++ }].slice(-100),
      })),

    upsertPlayer: (player) =>
      set((s) => ({ players: { ...s.players, [player.id]: player } })),

    patchPlayer: (id, patch) =>
      set((s) => {
        const current = s.players[id];
        if (!current) return s;
        return { players: { ...s.players, [id]: { ...current, ...patch } } };
      }),

    removePlayer: (id) =>
      set((s) => {
        const players = { ...s.players };
        delete players[id];
        const nearbyPeerIds = s.nearbyPeerIds.filter((n) => n !== id);
        return { players, nearbyPeerIds };
      }),

    setNearby: (ids) => set({ nearbyPeerIds: ids }),

    setRemoteStream: (peerId, stream) =>
      set((s) => ({ remoteStreams: { ...s.remoteStreams, [peerId]: stream } })),

    removeRemoteStream: (peerId) =>
      set((s) => {
        const remoteStreams = { ...s.remoteStreams };
        delete remoteStreams[peerId];
        return { remoteStreams };
      }),
  })),
);
