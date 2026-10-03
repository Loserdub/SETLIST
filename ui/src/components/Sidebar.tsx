import { useAppStore, type Route } from '../store/useAppStore';

interface NavItem {
  route: Route;
  label: string;
  badge?: string | number;
}

export function Sidebar() {
  const {
    currentRoute,
    setRoute,
    tracks,
    setlist,
    useMockBackend,
    setUseMockBackend,
    isLoadingTracks,
    isSuggestingOrder,
    progress,
    enterStageMode,
  } = useAppStore();

  const navItems: NavItem[] = [
    {
      route: 'library',
      label: 'Library',
      badge: tracks.length > 0 ? tracks.length : undefined,
    },
    {
      route: 'discovery',
      label: 'Discovery',
    },
    {
      route: 'track',
      label: 'Track',
    },
    {
      route: 'setlist',
      label: 'Setlist',
      badge: setlist.length > 0 ? `${setlist.length}` : undefined,
    },
    {
      route: 'settings',
      label: 'Settings',
    },
  ];

  const isBusy = isLoadingTracks || isSuggestingOrder || progress !== null;

  return (
    <aside className="w-56 bg-[#0a0a0a] border-r border-[#1a1a1a] flex flex-col justify-between select-none shrink-0 z-20">
      <div>
        {/* App Branding */}
        <div className="px-4 py-3.5 border-b border-[#1a1a1a] flex items-center justify-between">
          <div>
            <h1 className="text-xs font-mono font-bold tracking-widest text-[#f0f0f0] uppercase flex items-center gap-1.5">
              <span className="text-[#666666]">LOSERDUB /</span>
              <span>SETLIST</span>
            </h1>
            <p className="text-[10px] font-mono text-[#666666] tracking-wider uppercase mt-0.5">
              DJ Set Assistant
            </p>
          </div>
          <span className="w-1.5 h-1.5 bg-[#2a2a2a]" />
        </div>

        {/* Navigation Links */}
        <nav className="py-2" aria-label="Main Navigation">
          {navItems.map((item) => {
            const isActive = currentRoute === item.route;
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => setRoute(item.route)}
                className={`w-full flex items-center justify-between px-4 py-2 text-xs font-mono tracking-wider uppercase transition-colors cursor-pointer border-l-2 text-left ${
                  isActive
                    ? 'border-l-[#e5e5e5] bg-[#141414] text-[#ffffff] font-semibold'
                    : 'border-l-transparent text-[#7a7a7a] hover:text-[#d0d0d0] hover:bg-[#0e0e0e]'
                }`}
                data-testid={`nav-${item.route}`}
              >
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-mono border ${
                      isActive
                        ? 'bg-[#1e1e1e] text-[#e0e0e0] border-[#333333]'
                        : 'bg-[#111111] text-[#666666] border-[#1e1e1e]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {setlist.length > 0 && (
          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={enterStageMode}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-mono font-semibold tracking-wider text-[#e2e2e2] bg-[#141414] hover:bg-[#1a1a1a] hover:text-white border border-[#2b2b2b] uppercase transition-colors cursor-pointer"
              data-testid="nav-stage-btn"
            >
              <span>[ STAGE MODE ]</span>
            </button>
          </div>
        )}
      </div>

      {/* Footer & Backend Toggle */}
      <div className="p-3 border-t border-[#1a1a1a] space-y-2.5 bg-[#0a0a0a]">
        {/* Progress Alert */}
        {progress && (
          <div className="p-2 bg-[#0e0e0e] border border-[#242424] space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="capitalize text-[#cccccc] font-medium">
                {progress.stage}
              </span>
              <span className="text-[#777777]">
                {progress.current}/{progress.total}
              </span>
            </div>
            <div className="w-full bg-[#1a1a1a] h-1 overflow-hidden">
              <div
                className="bg-[#d0d0d0] h-1 transition-all duration-200"
                style={{
                  width: `${Math.round((progress.current / (progress.total || 1)) * 100)}%`,
                }}
              />
            </div>
            {progress.message && (
              <p className="text-[10px] font-mono text-[#666666] truncate">{progress.message}</p>
            )}
          </div>
        )}

        {/* Backend Selector */}
        <div className="flex items-center justify-between text-[11px] font-mono text-[#666666] px-1">
          <span className="flex items-center space-x-1.5">
            <span
              className={`w-1.5 h-1.5 ${
                isBusy ? 'bg-amber-400' : 'bg-emerald-500'
              }`}
            />
            <span className="tracking-tight">{useMockBackend ? 'Mock Engine' : 'Tauri Native'}</span>
          </span>
          <button
            type="button"
            onClick={() => setUseMockBackend(!useMockBackend)}
            className="text-[10px] text-[#555555] hover:text-[#999999] cursor-pointer"
          >
            [Switch]
          </button>
        </div>
      </div>
    </aside>
  );
}
