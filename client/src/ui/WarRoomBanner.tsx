import { useEffect } from 'react';
import { useStore } from '../store';

/** Tempo que o banner fica na tela antes de sumir sozinho. */
const AUTO_DISMISS_MS = 45_000;

/**
 * Banner de reunião de emergência: aparece para todos os logados quando o PO
 * convoca a war room. Some sozinho depois de um tempo ou ao clicar em ✕.
 */
export function WarRoomBanner() {
  const warroom = useStore((s) => s.warroom);

  useEffect(() => {
    if (!warroom) return;
    const t = setTimeout(() => useStore.setState({ warroom: null }), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [warroom]);

  if (!warroom) return null;

  return (
    <div className="warroom-banner" role="alert">
      <span className="warroom-icon">🚨</span>
      <span>
        <strong>Reunião de emergência!</strong> {warroom.fromName} convocou todos para a
        sala de reunião — agora.
      </span>
      <button
        className="warroom-dismiss"
        title="Dispensar aviso"
        onClick={() => useStore.setState({ warroom: null })}
      >
        ✕
      </button>
    </div>
  );
}
