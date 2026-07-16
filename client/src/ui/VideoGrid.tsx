import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { getLocalStream } from '../media/localMedia';
import { VideoTile } from './VideoTile';

/**
 * Peer no círculo de conversa mas com a câmera desligada: nada de vídeo —
 * só um chip com o nome, mantendo o ÁUDIO tocando num <audio> escondido.
 */
function AudioChip({ stream, name, micOn }: { stream: MediaStream; name: string; micOn: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="audio-chip">
      <audio ref={audioRef} autoPlay />
      <span className="chip-avatar">{micOn ? '🎙️' : '🔇'}</span>
      <span>{name}</span>
    </div>
  );
}

export function VideoGrid() {
  const remoteStreams = useStore((s) => s.remoteStreams);
  const players = useStore((s) => s.players);
  const camOn = useStore((s) => s.camOn);
  const localStream = getLocalStream();

  const entries = Object.entries(remoteStreams);
  if (entries.length === 0) return null;

  return (
    <div className="video-grid">
      {localStream && camOn && <VideoTile stream={localStream} name="Você" muted mirrored />}
      {entries.map(([peerId, stream]) => {
        const player = players[peerId];
        const name = player?.name ?? '…';
        return player?.camOn ? (
          <VideoTile
            key={peerId}
            stream={stream}
            name={player.micOn ? name : `${name} 🔇`}
          />
        ) : (
          <AudioChip key={peerId} stream={stream} name={name} micOn={player?.micOn ?? true} />
        );
      })}
    </div>
  );
}
