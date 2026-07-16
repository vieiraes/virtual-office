import { useStore } from './store';
import { JoinScreen } from './ui/JoinScreen';
import { VideoGrid } from './ui/VideoGrid';
import { ControlsBar } from './ui/ControlsBar';
import { ChatPanel } from './ui/ChatPanel';
import { MeetingPanel } from './ui/MeetingPanel';
import { HoldemPanel } from './ui/HoldemPanel';
import { CheckersPanel } from './ui/CheckersPanel';
import { WarRoomBanner } from './ui/WarRoomBanner';
import { PhaserGame } from './game/PhaserGame';

export default function App() {
  const phase = useStore((s) => s.phase);

  if (phase === 'join') return <JoinScreen />;

  return (
    <div className="office">
      <PhaserGame />
      <VideoGrid />
      <ChatPanel />
      <MeetingPanel />
      <HoldemPanel />
      <CheckersPanel />
      <WarRoomBanner />
      <ControlsBar />
    </div>
  );
}
