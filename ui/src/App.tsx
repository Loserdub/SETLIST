import { Sidebar } from './components/Sidebar';
import { LibraryRoute } from './components/routes/LibraryRoute';
import { TrackRoute } from './components/routes/TrackRoute';
import { SetlistRoute } from './components/routes/SetlistRoute';
import { SettingsRoute } from './components/routes/SettingsRoute';
import { useAppStore } from './store/useAppStore';

export function App() {
  const currentRoute = useAppStore((state) => state.currentRoute);

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <Sidebar />
      <main className="flex-1 flex flex-col h-full overflow-hidden" data-testid="app-main">
        {currentRoute === 'library' && <LibraryRoute />}
        {currentRoute === 'track' && <TrackRoute />}
        {currentRoute === 'setlist' && <SetlistRoute />}
        {currentRoute === 'settings' && <SettingsRoute />}
      </main>
    </div>
  );
}

export default App;

