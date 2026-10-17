import { useEffect } from 'react';
import { isTauriEnvironment } from './api';
import { Sidebar } from './components/Sidebar';
import { LibraryRoute } from './components/routes/LibraryRoute';
import { DiscoveryRoute } from './components/routes/DiscoveryRoute';
import { TrackRoute } from './components/routes/TrackRoute';
import { SetlistRoute } from './components/routes/SetlistRoute';
import { SettingsRoute } from './components/routes/SettingsRoute';
import { StageRoute } from './components/routes/StageRoute';
import { ToastContainer } from './components/ToastContainer';
import { useAppStore, type Route } from './store/useAppStore';
import { isStageModeEnabled } from './config/stageFeatureFlag';

export function App() {
  const currentRoute = useAppStore((state) => state.currentRoute);
  const isStageMode = useAppStore((state) => state.isStageMode);
  const hasLoadedTracks = useAppStore((state) => state.hasLoadedTracks);
  const loadTracks = useAppStore((state) => state.loadTracks);
  const hasLoadedActiveSetlist = useAppStore((state) => state.hasLoadedActiveSetlist);
  const loadActiveSetlist = useAppStore((state) => state.loadActiveSetlist);

  // Router Guard: if stage mode is quarantined/disabled, strictly redirect to Studio Mode ('library')
  const stageUnlocked = isStageModeEnabled();
  const effectiveRoute: Route =
    currentRoute === 'stage' && !stageUnlocked ? 'library' : currentRoute;
  const effectiveIsStageMode = isStageMode && stageUnlocked;

  useEffect(() => {
    // Inside the desktop app, force useMockBackend to false at startup
    if (isTauriEnvironment()) {
      useAppStore.setState({ useMockBackend: false });
    }
  }, []);

  // Router guard ensuring default app boot sequence lands strictly in Studio Mode
  useEffect(() => {
    if (!stageUnlocked && (currentRoute === 'stage' || isStageMode)) {
      useAppStore.setState({ isStageMode: false, currentRoute: 'library' });
    }
  }, [stageUnlocked, currentRoute, isStageMode]);

  // Independent SQLite library_db hydration on launch
  useEffect(() => {
    if (!hasLoadedTracks) {
      void loadTracks();
    }
    if (!hasLoadedActiveSetlist) {
      void loadActiveSetlist();
    }
  }, [hasLoadedTracks, loadTracks, hasLoadedActiveSetlist, loadActiveSetlist]);

  return (
    <div className="flex h-screen w-screen bg-[#080808] text-[#e2e2e2] overflow-hidden font-sans relative">
      {!effectiveIsStageMode && effectiveRoute !== 'stage' && <Sidebar />}
      <main
        className="flex-1 flex flex-col h-full overflow-hidden bg-[#080808]"
        data-testid="app-main"
      >
        {effectiveRoute === 'library' && <LibraryRoute />}
        {effectiveRoute === 'discovery' && <DiscoveryRoute />}
        {effectiveRoute === 'track' && <TrackRoute />}
        {effectiveRoute === 'setlist' && <SetlistRoute />}
        {effectiveRoute === 'settings' && <SettingsRoute />}
        {effectiveRoute === 'stage' && <StageRoute />}
      </main>
      {!effectiveIsStageMode && <ToastContainer />}

      {/* Corner Professional Software Stamp & IP Notice (Out of sight, but present) */}
      <footer
        className="fixed bottom-1.5 right-3 z-10 pointer-events-none select-none"
        aria-label="Software Intellectual Property"
      >
        <div
          className="pointer-events-auto flex items-center gap-1.5 text-xs font-mono tracking-wide text-[#a8a8a8] hover:text-[#ededed] transition-colors cursor-help opacity-75 hover:opacity-100"
          title="TRUSTNODELOGIC • Proprietary Intellectual Property • All Rights Reserved. System architecture, transition scoring models, and DSP pipelines are protected."
        >
          <span className="w-1.5 h-1.5 bg-[#666666] rounded-full inline-block" />
          <span className="font-semibold uppercase">TRUSTNODELOGIC</span>
          <span className="text-xs text-[#a8a8a8] tracking-normal">
            © 2026 IP
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
