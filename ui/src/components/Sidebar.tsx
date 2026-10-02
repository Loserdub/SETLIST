import { useAppStore, type Route } from '../store/useAppStore';

interface NavItem {
  route: Route;
  label: string;
  icon: string;
  badge?: string | number;
}

export function Sidebar() {
  const { currentRoute, setRoute, tracks, setlist, useMockBackend, setUseMockBackend, isLoadingTracks, isSuggestingOrder, progress } =
    useAppStore();

  const navItems: NavItem[] = [
    {
      route: 'library',
      label: 'Library',
      icon: '🎵',
      badge: tracks.length > 0 ? tracks.length : undefined,
    },
    {
      route: 'track',
      label: 'Track',
      icon: '🎚️',
    },
    {
      route: 'setlist',
      label: 'Setlist',
      icon: '📋',
      badge: setlist.length > 0 ? `${setlist.length}` : undefined,
    },
    {
      route: 'settings',
      label: 'Settings',
      icon: '⚙️',
    },
  ];

  const isBusy = isLoadingTracks || isSuggestingOrder || progress !== null;

  return (
    <aside className="w-64 bg-slate-900/90 border-r border-slate-800 flex flex-col justify-between select-none">
      <div>
        {/* App Branding */}
        <div className="p-6 border-b border-slate-800/80 flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <span className="text-xl">🎧</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight leading-none">
              SETLIST
            </h1>
            <p className="text-[11px] font-medium text-slate-400 mt-1 uppercase tracking-wider">
              DJ Set Assistant
            </p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-3 space-y-1" aria-label="Main Navigation">
          {navItems.map((item) => {
            const isActive = currentRoute === item.route;
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => setRoute(item.route)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
                data-testid={`nav-${item.route}`}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full font-mono font-semibold ${
                      isActive
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer & Backend Toggle */}
      <div className="p-4 border-t border-slate-800/80 space-y-3 bg-slate-950/40">
        {/* Progress Alert */}
        {progress && (
          <div className="p-2.5 bg-slate-900 border border-emerald-500/30 rounded-lg space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="capitalize text-emerald-400 font-medium">
                {progress.stage}...
              </span>
              <span className="text-slate-400 font-mono">
                {progress.current}/{progress.total}
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.round((progress.current / (progress.total || 1)) * 100)}%`,
                }}
              />
            </div>
            {progress.message && (
              <p className="text-[11px] text-slate-400 truncate">{progress.message}</p>
            )}
          </div>
        )}

        {/* Backend Selector */}
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span className="flex items-center space-x-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isBusy ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
              }`}
            />
            <span>{useMockBackend ? 'Mock Backend' : 'Tauri Native'}</span>
          </span>
          <button
            type="button"
            onClick={() => setUseMockBackend(!useMockBackend)}
            className="text-[11px] text-slate-500 hover:text-slate-300 underline cursor-pointer"
          >
            Switch
          </button>
        </div>
      </div>
    </aside>
  );
}
