import { useStore } from '../store';
import { socket } from '../net/socket';

let localStream: MediaStream | null = null;

/** Avisa os outros que o mic/câmera mudou (some/aparece o tile de vídeo lá). */
export function broadcastMediaState() {
  const { micOn, camOn } = useStore.getState();
  socket.emit('media-state', { micOn, camOn });
}

export function getLocalStream(): MediaStream | null {
  return localStream;
}

/**
 * Pede câmera+microfone uma única vez, no join.
 * 320x240@15 é proposital: num mesh de até 9 peers cada track sobe 9 vezes;
 * resolução baixa mantém o upload total em ~2-3 Mbps.
 */
export async function initLocalMedia(): Promise<MediaStream | null> {
  if (localStream) return localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } },
    });
    // A track de vídeo é capturada (evita renegociação depois) mas começa
    // DESABILITADA: ao se aproximar de alguém só o áudio + chat ficam ativos;
    // cada pessoa liga a própria câmera manualmente se quiser.
    localStream.getVideoTracks().forEach((t) => (t.enabled = false));
    return localStream;
  } catch (err) {
    console.warn('[media] getUserMedia falhou — entrando como espectador', err);
    useStore.setState({ spectator: true, micOn: false, camOn: false });
    return null;
  }
}

/** track.enabled=false em vez de stop(): instantâneo, mantém a conexão viva e propaga a todos os peers. */
export function toggleMic() {
  if (!localStream) return;
  const on = !useStore.getState().micOn;
  localStream.getAudioTracks().forEach((t) => (t.enabled = on));
  useStore.setState({ micOn: on });
  broadcastMediaState();
}

export function toggleCam() {
  if (!localStream) return;
  const on = !useStore.getState().camOn;
  localStream.getVideoTracks().forEach((t) => (t.enabled = on));
  useStore.setState({ camOn: on });
  broadcastMediaState();
}
