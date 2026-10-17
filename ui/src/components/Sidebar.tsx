import { isTauriEnvironment } from '../api';
import { useAppStore, type Route } from '../store/useAppStore';
import { isStageModeEnabled } from '../config/stageFeatureFlag';

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
    <aside className="w-56 bg-[#0a0a0a] border-r border-[#1a1a1a] flex flex-col justify-between select-none shrink-0 z-20">
      <div>
        {/* App Branding */}
        <div className="px-4 py-3.5 border-b border-[#1a1a1a] flex items-center justify-between">
          <div>
            <h1 className="text-sm font-mono font-extrabold tracking-widest text-white uppercase">
              SETLIST
            </h1>
            <p className="text-xs font-mono text-[#a8a8a8] tracking-normal mt-0.5">
              DJ set prep
            </p>
          </div>
          <span className="w-1.5 h-1.5 bg-[#2a2a2a]" />
        </div>

        {/* Navigation Links */}
        <nav className="py-2" aria-label="Main Navigation">
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
                className={`w-full flex items-center justify-between px-4 py-2 text-xs font-mono tracking-wider uppercase transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] ${
                  isTrackDisabled
                    ? 'border-l-2 border-l-transparent text-[#666666] opacity-40 cursor-not-allowed'
                    : isActive
                    ? 'border-l-2 border-l-[#e5e5e5] bg-[#141414] text-[#ffffff] font-semibold cursor-pointer'
                    : 'border-l-2 border-l-transparent text-[#a8a8a8] hover:text-[#ffffff] hover:bg-[#0e0e0e] cursor-pointer'
                }`}
                data-testid={`nav-${item.route}`}
              >
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 text-xs font-mono border ${
                      isActive
                        ? 'bg-[#1e1e1e] text-[#ededed] border-[#333333]'
                        : 'bg-[#111111] text-[#a8a8a8] border-[#1e1e1e]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {isStageModeEnabled() && setlistLength > 0 && (
          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={enterStageMode}
              title="Enter full-screen live performance mode"
              aria-label="Stage Mode - Enter full-screen live performance mode"
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-mono font-semibold tracking-wider text-[#ededed] bg-[#141414] hover:bg-[#1a1a1a] hover:text-white border border-[#2b2b2b] uppercase transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
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
          <div className="p-2 bg-[#0e0e0e] border border-[#242424] space-y-1.5" aria-live="polite">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="capitalize text-[#cfcfcf] font-medium">
                {progress.stage}
              </span>
              <span className="text-[#a8a8a8]">
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
              <p className="text-xs font-mono text-[#a8a8a8] truncate">{progress.message}</p>
            )}
          </div>
        )}

        {/* Backend Selector (Visible only outside Tauri or when VITE_SHOW_DEV_TOOLS is set) */}
        {showMockSwitch && (
          <div className="flex items-center justify-between text-xs font-mono text-[#a8a8a8] px-1">
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
              className="text-xs text-[#a8a8a8] hover:text-[#ededed] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
            >
              [Switch]
            </button>
          </div>
        )}

        {/* Professional Software Label & Intellectual Property Notice */}
        <div className="pt-2.5 border-t border-[#161616] px-1 space-y-1 select-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-[#555555]" />
              <span className="font-mono text-xs font-bold tracking-wider text-[#a8a8a8] uppercase hover:text-white transition-colors">
                TRUSTNODELOGIC
              </span>
            </div>
            <span className="text-xs font-mono px-1.5 py-0.5 border border-[#2e2e2e] bg-[#111111] text-[#a8a8a8] uppercase tracking-wider">
              CORE IP
            </span>
          </div>
          <p
            className="text-xs font-mono text-[#a8a8a8] hover:text-[#ededed] leading-relaxed tracking-normal transition-colors cursor-help select-text"
            title="Intellectual Property of TRUSTNODELOGIC. All rights reserved. Proprietary software architecture, audio DSP algorithms, and transition scoring models. Unauthorized reproduction, reverse engineering, or redistribution strictly prohibited."
          >
            © 2026 TRUSTNODELOGIC. Proprietary IP. All rights reserved.
          </p>
        </div>
      </div>
    </aside>
  );
}
