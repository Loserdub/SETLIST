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
    </div>
  );
}

export default App;


