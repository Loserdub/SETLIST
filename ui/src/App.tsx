import { Sidebar } from './components/Sidebar';
import { LibraryRoute } from './components/routes/LibraryRoute';
import { DiscoveryRoute } from './components/routes/DiscoveryRoute';
import { TrackRoute } from './components/routes/TrackRoute';
import { SetlistRoute } from './components/routes/SetlistRoute';
import { SettingsRoute } from './components/routes/SettingsRoute';
import { StageRoute } from './components/routes/StageRoute';
import { ToastContainer } from './components/ToastContainer';
import { useAppStore } from './store/useAppStore';

export function App() {
  const currentRoute = useAppStore((state) => state.currentRoute);
  const isStageMode = useAppStore((state) => state.isStageMode);

  return (
    <div className="flex h-screen w-screen bg-[#080808] text-[#e2e2e2] overflow-hidden font-sans relative">
      {!isStageMode && currentRoute !== 'stage' && <Sidebar />}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#080808]" data-testid="app-main">
        {currentRoute === 'library' && <LibraryRoute />}
        {currentRoute === 'discovery' && <DiscoveryRoute />}
        {currentRoute === 'track' && <TrackRoute />}
        {currentRoute === 'setlist' && <SetlistRoute />}
        {currentRoute === 'settings' && <SettingsRoute />}
        {currentRoute === 'stage' && <StageRoute />}
      </main>
      {!isStageMode && <ToastContainer />}

      {/* Corner Professional Software Stamp & IP Notice (Out of sight, but present) */}
      <footer
        className="fixed bottom-1.5 right-3 z-10 pointer-events-none select-none"
        aria-label="Software Intellectual Property"
      >
        <div
          className="pointer-events-auto flex items-center gap-1.5 text-[9px] font-mono tracking-widest text-[#404040] hover:text-[#888888] transition-colors cursor-help opacity-40 hover:opacity-100"
          title="TRUSTNODELOGIC • Proprietary Intellectual Property • All Rights Reserved. System architecture, transition scoring models, and DSP pipelines are protected."
        >
          <span className="w-1 h-1 bg-[#333333] rounded-full inline-block" />
          <span className="font-semibold uppercase">TRUSTNODELOGIC</span>
          <span className="text-[7.5px] text-[#2c2c2c] uppercase tracking-normal">
            © 2026 IP
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;


