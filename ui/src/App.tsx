import { useEffect, useRef, useState } from 'react';
import { isTauriEnvironment } from './api';
import { Sidebar } from './components/Sidebar';
import { LibraryRoute } from './components/routes/LibraryRoute';
import { DiscoveryRoute } from './components/routes/DiscoveryRoute';
import { TrackRoute } from './components/routes/TrackRoute';
import { SetlistRoute } from './components/routes/SetlistRoute';
import { SettingsRoute } from './components/routes/SettingsRoute';
import { StageRoute } from './components/routes/StageRoute';
import { StartScreen } from './features/start';
import { openLibraryWithReviewFilter } from './features/library';
import { QuickSetModal } from './features/setlist/QuickSetModal';
import { ToastContainer } from './components/ToastContainer';
import { GlobalTransportBar } from './components/transport/GlobalTransportBar';
import { useAppStore } from './store/useAppStore';

export function App() {
  const currentRoute = useAppStore((state) => state.currentRoute);
  const setRoute = useAppStore((state) => state.setRoute);
  const isStageMode = useAppStore((state) => state.isStageMode);
  const hasLoadedTracks = useAppStore((state) => state.hasLoadedTracks);
  const loadTracks = useAppStore((state) => state.loadTracks);
  const hasLoadedActiveSetlist = useAppStore((state) => state.hasLoadedActiveSetlist);
  const loadActiveSetlist = useAppStore((state) => state.loadActiveSetlist);

  const [isQuickSetOpen, setIsQuickSetOpen] = useState(false);
  const hasLandedRef = useRef(false);

  useEffect(() => {
    // Inside the desktop app, force useMockBackend to false at startup
    if (isTauriEnvironment()) {
      useAppStore.setState({ useMockBackend: false });
    }
  }, []);

  // Landing route resolution:
  // Open on Start when the library is empty. Otherwise open on My Music (library).
  // Do not use localStorage for this.
  useEffect(() => {
    if (!hasLoadedTracks && !hasLandedRef.current) {
      void (async () => {
        await loadTracks();
        hasLandedRef.current = true;
        const current = useAppStore.getState().currentRoute;
        if (current === 'library' || current === 'start') {
          const currentTracks = useAppStore.getState().tracks;
          if (currentTracks.length === 0) {
            setRoute('start');
          } else {
            setRoute('library');
          }
        }
      })();
    }
  }, [hasLoadedTracks, loadTracks, setRoute]);

  useEffect(() => {
    if (!hasLoadedActiveSetlist) {
      void loadActiveSetlist();
    }
  }, [hasLoadedActiveSetlist, loadActiveSetlist]);

  const auditionTrackId = useAppStore((state) => state.auditionTrackId);
  const auditionState = useAppStore((state) => state.auditionState);
  const isAuditioning = Boolean(auditionTrackId && auditionState !== 'stopped');

  return (
    <div className="flex h-screen w-screen bg-[#080808] text-[#e2e2e2] overflow-hidden font-sans relative">
      {!isStageMode && currentRoute !== 'stage' && <Sidebar />}
      <main
        className={`flex-1 flex flex-col h-full overflow-hidden bg-[#080808] transition-all duration-150 ${
          isAuditioning && !isStageMode && currentRoute !== 'track' ? 'pb-14' : ''
        }`}
        data-testid="app-main"
      >
        {currentRoute === 'start' && (
          <StartScreen
            onOpenFilteredLibrary={openLibraryWithReviewFilter}
            onQuickSet={() => setIsQuickSetOpen(true)}
          />
        )}
        {currentRoute === 'library' && <LibraryRoute />}
        {currentRoute === 'discovery' && <DiscoveryRoute />}
        {currentRoute === 'track' && <TrackRoute />}
        {currentRoute === 'setlist' && <SetlistRoute />}
        {currentRoute === 'settings' && <SettingsRoute />}
        {currentRoute === 'stage' && <StageRoute />}
      </main>
      <QuickSetModal
        isOpen={isQuickSetOpen}
        onClose={() => setIsQuickSetOpen(false)}
      />
      {!isStageMode && currentRoute !== 'stage' && currentRoute !== 'track' && (
        <GlobalTransportBar />
      )}
      {!isStageMode && <ToastContainer />}

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


