import { useState } from 'react';
import { AVATAR_COLORS, ROLE_LABELS, type Role } from '@vo/shared';
import { initLocalMedia } from '../media/localMedia';
import { joinOffice } from '../net/socket';
import { peerManager } from '../net/PeerManager';
import { startProximityLoop } from '../game/proximity';

export function JoinScreen() {
  const [name, setName] = useState('');
  const [color, setColor] = useState(AVATAR_COLORS[1]);
  const [role, setRole] = useState<Role>('dev');
  const [joining, setJoining] = useState(false);
  const [mediaDenied, setMediaDenied] = useState(false);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || joining) return;
    setJoining(true);
    // pede permissão de câmera/mic ANTES de entrar — se negar, entra como espectador
    const stream = await initLocalMedia();
    if (!stream) setMediaDenied(true);
    peerManager.start();
    startProximityLoop();
    joinOffice(name.trim(), color, role);
  }

  return (
    <div className="join-screen">
      <form className="join-card" onSubmit={handleJoin}>
        <h1>🏢 Virtual Office</h1>
        <p className="subtitle">
          Ande pelo escritório com as setas ou WASD. Chegue perto de alguém para
          conversar por voz e chat — afaste-se para encerrar. A câmera fica
          desligada até você querer ligar.
        </p>

        <label htmlFor="name">Seu nome</label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Como seus colegas te chamam?"
          maxLength={24}
          autoFocus
        />

        <label>Seu papel no squad</label>
        <div className="role-picker">
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <button
              key={r}
              type="button"
              className={`role-btn ${r === role ? 'selected' : ''}`}
              onClick={() => setRole(r)}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>

        <label>Cor do avatar</label>
        <div className="swatches">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch ${c === color ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Cor ${c}`}
            />
          ))}
        </div>

        {mediaDenied && (
          <p className="warning">
            Sem acesso à câmera/microfone — você entrará como espectador (vê e
            ouve os outros, mas não transmite).
          </p>
        )}

        <button type="submit" className="join-btn" disabled={!name.trim() || joining}>
          {joining ? 'Entrando…' : 'Entrar no escritório'}
        </button>
      </form>
    </div>
  );
}
