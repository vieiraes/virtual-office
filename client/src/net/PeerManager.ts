import type { SignalIceIn, SignalOfferIn } from '@vo/shared';
import { useStore } from '../store';
import { getLocalStream } from '../media/localMedia';
import { socket } from './socket';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  // TURN (se alguém atrás de NAT simétrico não conectar): adicionar aqui
  // { urls: 'turn:...', username: '...', credential: '...' } — ver README.
};

/**
 * Mesh P2P: uma RTCPeerConnection por peer próximo.
 *
 * Regra de iniciador: no par (A,B), quem tem o socket.id lexicograficamente
 * MENOR cria a offer. O outro lado é accept-on-offer: cria o peer connection
 * ao receber a offer, mesmo que a própria histerese ainda não tenha disparado.
 * Isso elimina glare (offers simultâneas) por construção.
 */
class PeerManager {
  private peers = new Map<string, RTCPeerConnection>();
  // Candidatos ICE que chegam antes do setRemoteDescription precisam ser
  // enfileirados e aplicados depois — addIceCandidate sem remoteDescription falha.
  private pendingIce = new Map<string, RTCIceCandidateInit[]>();
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;

    socket.on('webrtc-offer', (msg: SignalOfferIn) => void this.onOffer(msg));
    socket.on('webrtc-answer', (msg: SignalOfferIn) => void this.onAnswer(msg));
    socket.on('webrtc-ice', (msg: SignalIceIn) => void this.onIce(msg));
    socket.on('player-left', ({ id }: { id: string }) => this.closePeer(id));
    socket.on('disconnect', () => this.closeAll());

    useStore.subscribe(
      (s) => s.nearbyPeerIds,
      (ids, prevIds) => {
        for (const id of ids) {
          if (!prevIds.includes(id)) void this.maybeInitiate(id);
        }
        for (const id of prevIds) {
          if (!ids.includes(id)) this.closePeer(id);
        }
      },
    );
  }

  private createPeer(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.peers.set(peerId, pc);

    const stream = getLocalStream();
    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    } else {
      // Espectador (sem câmera/mic): sem transceivers a offer sairia sem
      // m-lines e nenhuma mídia chegaria — recvonly garante o recebimento.
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.addTransceiver('video', { direction: 'recvonly' });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('webrtc-ice', { to: peerId, candidate: e.candidate.toJSON() });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (stream) useStore.getState().setRemoteStream(peerId, stream);
    };

    // 'disconnected' pode ser transitório e o afastamento normal já é coberto
    // pela histerese dos dois lados (distância é simétrica) — só limpa em 'failed'.
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') this.closePeer(peerId);
    };

    return pc;
  }

  private async maybeInitiate(peerId: string) {
    const myId = useStore.getState().selfId;
    if (!myId || myId >= peerId) return; // o outro lado inicia
    if (this.peers.has(peerId)) return;
    try {
      const pc = this.createPeer(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc-offer', { to: peerId, sdp: offer });
    } catch (err) {
      console.error('[rtc] falha ao iniciar offer para', peerId, err);
      this.closePeer(peerId);
    }
  }

  private async onOffer({ from, sdp }: SignalOfferIn) {
    try {
      let pc = this.peers.get(from);
      if (!pc) pc = this.createPeer(from); // accept-on-offer
      await pc.setRemoteDescription(sdp);
      await this.flushIce(from, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', { to: from, sdp: answer });
    } catch (err) {
      console.error('[rtc] falha ao responder offer de', from, err);
      this.closePeer(from);
    }
  }

  private async onAnswer({ from, sdp }: SignalOfferIn) {
    const pc = this.peers.get(from);
    if (!pc) return;
    try {
      await pc.setRemoteDescription(sdp);
      await this.flushIce(from, pc);
    } catch (err) {
      console.error('[rtc] falha ao aplicar answer de', from, err);
      this.closePeer(from);
    }
  }

  private async onIce({ from, candidate }: SignalIceIn) {
    const pc = this.peers.get(from);
    if (pc?.remoteDescription) {
      await pc.addIceCandidate(candidate).catch((err) => {
        console.warn('[rtc] candidato ICE inválido de', from, err);
      });
    } else {
      const queue = this.pendingIce.get(from) ?? [];
      queue.push(candidate);
      this.pendingIce.set(from, queue);
    }
  }

  private async flushIce(peerId: string, pc: RTCPeerConnection) {
    const queue = this.pendingIce.get(peerId);
    if (!queue) return;
    this.pendingIce.delete(peerId);
    for (const candidate of queue) {
      await pc.addIceCandidate(candidate).catch((err) => {
        console.warn('[rtc] candidato ICE enfileirado inválido de', peerId, err);
      });
    }
  }

  private closePeer(peerId: string) {
    const pc = this.peers.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      this.peers.delete(peerId);
    }
    this.pendingIce.delete(peerId);
    useStore.getState().removeRemoteStream(peerId);
  }

  private closeAll() {
    for (const peerId of [...this.peers.keys()]) this.closePeer(peerId);
  }
}

export const peerManager = new PeerManager();
