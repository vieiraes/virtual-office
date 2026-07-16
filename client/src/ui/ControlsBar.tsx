import { useStore } from '../store';
import { toggleCam, toggleMic } from '../media/localMedia';

export function ControlsBar() {
  const micOn = useStore((s) => s.micOn);
  const camOn = useStore((s) => s.camOn);
  const spectator = useStore((s) => s.spectator);
  const nearbyCount = useStore((s) => s.nearbyPeerIds.length);
  const myCards = useStore((s) =>
    s.roomState.cards.filter((c) => c.assigneeId === s.selfId).length,
  );

  return (
    <div className="controls-bar">
      {spectator ? (
        <span className="spectator-badge">👀 Modo espectador</span>
      ) : (
        <>
          <button
            className={micOn ? 'ctl on' : 'ctl off'}
            onClick={toggleMic}
            title={micOn ? 'Desligar microfone' : 'Ligar microfone'}
          >
            {micOn ? '🎙️ Mic on' : '🔇 Mic off'}
          </button>
          <button
            className={camOn ? 'ctl on' : 'ctl off'}
            onClick={toggleCam}
            title={camOn ? 'Desligar câmera' : 'Ligar câmera'}
          >
            {camOn ? '📷 Cam on' : '🚫 Cam off'}
          </button>
        </>
      )}
      <span className="nearby-badge">
        {nearbyCount > 0
          ? `💬 Conversando com ${nearbyCount} ${nearbyCount === 1 ? 'pessoa' : 'pessoas'}`
          : '🚶 Aproxime-se de alguém para conversar'}
      </span>
      {myCards > 0 && (
        <span className="nearby-badge" title="Cards atribuídos a você na sala de reunião">
          📋 {myCards} {myCards === 1 ? 'card' : 'cards'}
        </span>
      )}
    </div>
  );
}
