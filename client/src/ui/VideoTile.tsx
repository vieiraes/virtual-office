import { useEffect, useRef } from 'react';

interface Props {
  stream: MediaStream;
  name: string;
  muted?: boolean;
  mirrored?: boolean;
}

export function VideoTile({ stream, name, muted = false, mirrored = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="video-tile">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={mirrored ? 'mirrored' : undefined}
      />
      <span className="tile-name">{name}</span>
    </div>
  );
}
