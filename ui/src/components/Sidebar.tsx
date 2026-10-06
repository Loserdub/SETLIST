import { isTauriEnvironment } from '../api';
import { useAppStore, type Route } from '../store/useAppStore';

interface NavItem {
  route: Route;
  label: string;
  description: string;
  badge?: string | number;
}

export function Sidebar() {
  const currentRoute = useAppStore((s) => s.currentRoute);
  const setRoute = useAppStore((s) => s.setRoute);
  const tracksLength = useAppStore((s) => s.tracks.length);
  const setlistLength = useAppStore((s) => s.setlist.length);
  const useMockBackend = useAppStore((s) => s.useMockBackend);
  const setUseMockBackend = useAppStore((s) => s.setUseMockBackend);
  const isLoadingTracks = useAppStore((s) => s.isLoadingTracks);
  const isSuggestingOrder = useAppStore((s) => s.isSuggestingOrder);
  const progress = useAppStore((s) => s.progress);
  const enterStageMode = useAppStore((s) => s.enterStageMode);
  const selectedTrackId = useAppStore((s) => s.selectedTrackId);
  const selectedTrack = useAppStore((s) => s.selectedTrack);

  const hasSelectedTrack = Boolean(selectedTrackId || selectedTrack);

  const navItems: NavItem[] = [
    {
      route: 'library',
      label: 'My Music',
      description: 'Browse and search your music library',
      badge: tracksLength > 0 ? tracksLength : undefined,
    },
    {
      route: 'discovery',
      label: 'Find Transitions',
      description: 'Discover harmonic transitions, bridges, and mix paths',
    },
    {
      route: 'track',
      label: 'Track Detail',
      description: 'Inspect beat grid, cues, and waveform for the selected track',
    },
    {
      route: 'setlist',
      label: 'My Set',
      description: 'Build, reorder, and optimize your active setlist',
      badge: setlistLength > 0 ? `${setlistLength}` : undefined,
    },
    {
      route: 'settings',
      label: 'Settings',
      description: 'Configure transition scoring weights and app preferences',
    },
  ];

  const isBusy = isLoadingTracks || isSuggestingOrder || progress !== null;

  // Show mock backend switch only outside Tauri or when VITE_SHOW_DEV_TOOLS is set
  const showDevTools =
    typeof import.meta !== 'undefined' &&
    Boolean(
      import.meta.env?.VITE_SHOW_DEV_TOOLS &&
        import.meta.env.VITE_SHOW_DEV_TOOLS !== 'false' &&
        import.meta.env.VITE_SHOW_DEV_TOOLS !== '0'
    );
  const showMockSwitch = !isTauriEnvironment() || showDevTools;

  return (
    <aside className="w-56 bg-surface-panel border-r border-border-subtle flex flex-col justify-between select-none shrink-0 z-20 h-full overflow-hidden">
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* App Branding */}
        <div className="px-4 py-3.5 border-b border-border-subtle flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-sm font-mono font-extrabold tracking-widest text-white uppercase">
              SETLIST
            </h1>
            <p className="text-xs font-mono text-content-muted tracking-normal mt-0.5">
              DJ set prep
            </p>
          </div>
          <span className="w-1.5 h-1.5 bg-surface-hover" />
        </div>

        {/* Scrollable Navigation Region */}
        <div className="flex-1 overflow-y-auto min-h-0 py-2">
          <nav aria-label="Main Navigation">
            {navItems.map((item) => {
              const isActive = currentRoute === item.route;
              const isTrackDisabled = item.route === 'track' && !hasSelectedTrack;
              const tooltip = isTrackDisabled
                ? 'Open a track from My Music'
                : item.description;
              const ariaLabel = isTrackDisabled
                ? `${item.label} - Open a track from My Music`
                : `${item.label} - ${item.description}`;

              return (
                <button
                  key={item.route}
                  type="button"
                  disabled={isTrackDisabled}
                  title={tooltip}
                  aria-label={ariaLabel}
                  onClick={() => setRoute(item.route)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-xs font-mono tracking-wider uppercase text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 hw-btn active:translate-y-[1px] ${
                    isTrackDisabled
                      ? 'border-l-2 border-l-transparent text-content-dim opacity-40 cursor-not-allowed'
                      : isActive
                      ? 'border-l-2 border-l-amber-500 bg-surface-raised text-content-primary font-semibold cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                      : 'border-l-2 border-l-transparent text-content-muted hover:text-content-primary hover:bg-surface-panel hover:border-l-amber-500/40 cursor-pointer'
                  }`}
                  data-testid={`nav-${item.route}`}
                >
                  <div className="flex items-center gap-2">
                    {isActive && <span className="hw-led hw-led-cyan" />}
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span
                      className={`px-1.5 py-0.5 text-xs font-mono border ${
                        isActive
                          ? 'bg-surface-elevated text-content-primary border-amber-500/40'
                          : 'bg-surface-raised text-content-muted border-border-subtle'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {setlistLength > 0 && (
            <div className="px-3 pt-3">
              <button
                type="button"
                onClick={enterStageMode}
                title="Enter full-screen live performance mode"
                aria-label="Stage Mode - Enter full-screen live performance mode"
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-mono font-semibold tracking-wider text-content-primary bg-surface-raised hover:bg-surface-elevated hover:text-white border border-border-base uppercase cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 hw-btn"
                data-testid="nav-stage-btn"
              >
                <span>[ STAGE MODE ]</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer & Backend Toggle */}
      <div className="p-3 border-t border-border-subtle space-y-2.5 bg-surface-panel shrink-0">
        {/* Progress Alert */}
        {progress && (
          <div className="p-2 bg-surface-panel border border-border-base space-y-1.5" aria-live="polite">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="capitalize text-content-secondary font-medium">
                {progress.stage}
              </span>
              <span className="text-content-muted">
                {progress.current}/{progress.total}
              </span>
            </div>
            <div className="w-full bg-surface-elevated h-1 overflow-hidden">
              <div
                className="bg-content-secondary h-1 transition-all duration-200"
                style={{
                  width: `${Math.round((progress.current / (progress.total || 1)) * 100)}%`,
                }}
              />
            </div>
            {progress.message && (
              <p className="text-xs font-mono text-content-muted truncate">{progress.message}</p>
            )}
          </div>
        )}

        {/* Backend Selector (Visible only outside Tauri or when VITE_SHOW_DEV_TOOLS is set) */}
        {showMockSwitch && (
          <div className="flex items-center justify-between text-xs font-mono text-content-muted px-1">
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
              className="text-xs text-content-muted hover:text-content-primary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              [Switch]
            </button>
          </div>
        )}

        {/* Professional Software Label & Intellectual Property Notice */}
        <div className="pt-2 border-t border-border-subtle px-1 space-y-1 select-none">
          <div className="flex items-center justify-between gap-1 text-xs font-mono">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-1.5 h-1.5 bg-amber-500/70 shrink-0" />
              <span className="font-bold tracking-wider text-content-muted uppercase truncate">
                TRUSTNODELOGIC
              </span>
            </div>
            <span className="shrink-0 text-[11px] font-mono px-1 py-0.5 border border-border-base bg-surface-raised text-content-muted uppercase tracking-widest">
              CORE IP
            </span>
          </div>
          <p
            className="text-[11px] font-mono text-content-muted hover:text-content-primary leading-tight tracking-normal transition-colors cursor-help select-text"
            title="Intellectual Property of TRUSTNODELOGIC. All rights reserved. Proprietary software architecture, audio DSP algorithms, and transition scoring models. Unauthorized reproduction, reverse engineering, or redistribution strictly prohibited."
          >
            © 2026 TRUSTNODELOGIC. Proprietary IP. All rights reserved.
          </p>
        </div>
      </div>
    </aside>
  );
}
