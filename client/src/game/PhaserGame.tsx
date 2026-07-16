import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { OfficeScene } from './OfficeScene';

export function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current!,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      physics: { default: 'arcade' },
      scene: [OfficeScene],
      backgroundColor: '#1e1f22',
    });
    (window as unknown as Record<string, unknown>).__voGame = game;
    return () => game.destroy(true);
  }, []);

  // canvas não é focável: clicar nele não tiraria o foco do input do chat,
  // deixando o teclado do jogo preso — blur explícito resolve
  return (
    <div
      ref={containerRef}
      className="game-root"
      onPointerDown={() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.tagName === 'INPUT') active.blur();
      }}
    />
  );
}
