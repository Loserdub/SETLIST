import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';

interface EmptyLibraryViewProps {
  onChooseFolder: () => void;
  onScanFolder: (path: string) => void;
  onLoadDemo: () => void;
  onLoadBenchmark: () => void;
  onReload?: () => void;
  isLoading: boolean;
}

export const EmptyLibraryView: React.FC<EmptyLibraryViewProps> = ({
  onChooseFolder,
  onScanFolder,
  onLoadDemo,
  onLoadBenchmark,
  onReload,
  isLoading,
}) => {
  const [folderPathInput, setFolderPathInput] = useState('');

  // Native files picker (audio files)
  const handleChooseFiles = async () => {
    try {
      const selected = await open({
        directory: false,
        multiple: true,
        title: 'Choose Audio Files',
        filters: [
          {
            name: 'Audio Files',
            extensions: ['mp3', 'flac', 'wav', 'wave', 'aif', 'aiff', 'aac', 'm4a', 'ogg'],
          },
        ],
      });
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        if (paths.length > 0) {
          onScanFolder(paths[0]); // or onScanPaths
        }
      }
    } catch (err) {
      console.warn('Native file picker not available:', err);
    }
  };

  return (
    <div
      data-testid="empty-library-view"
      className="max-w-2xl mx-auto my-8 p-6 sm:p-8 border border-[#27272a] bg-[#0c0c0f] text-center flex flex-col items-center font-mono select-none relative overflow-hidden"
    >
      {/* Boutique Status Beacon */}
      <div className="flex items-center gap-2 px-3 py-1 bg-[#121215] border border-[#27272a] text-xs text-amber-300 uppercase tracking-widest font-bold font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block shadow-[0_0_4px_rgba(245,158,11,0.6)]" />
        <span>STANDBY · READY FOR INGESTION</span>
      </div>

      <h3 className="text-base font-bold tracking-widest text-[#f8fafc] uppercase mt-4">
        Your library is empty
      </h3>

      <div className="text-xs text-zinc-400 max-w-lg mt-2.5 space-y-1 leading-relaxed">
        <p>SETLIST is your local-first DJ set preparation co-pilot.</p>
        <p>Your audio files are strictly read-only and never modified.</p>
        <p>Scan a music folder to analyze tempo, Camelot keys, and energy.</p>
      </div>

      {/* 4-Step Producer Workflow Pipeline Strip */}
      <div className="w-full my-5 py-2 px-3 bg-[#08080a] border border-[#27272a] flex flex-wrap items-center justify-center gap-2 text-xs font-bold tracking-wider font-mono">
        <span className="text-zinc-200">1. DROP AUDIO</span>
        <span className="text-zinc-600">→</span>
        <span className="text-zinc-300">2. ANALYZE DSP</span>
        <span className="text-zinc-600">→</span>
        <span className="text-amber-400">3. UNDERSTAND</span>
        <span className="text-zinc-600">→</span>
        <span className="text-emerald-400">4. CATALOG</span>
      </div>

      {/* Primary Folder & Audio File Selection Actions */}
      <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-md">
        <button
          type="button"
          onClick={onChooseFolder}
          className="flex-1 min-w-[160px] px-5 py-2.5 bg-[#18181b] hover:bg-[#27272a] border border-zinc-600 text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer rounded-none flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none hw-btn active:translate-y-[1px]"
          data-testid="empty-choose-folder-btn"
          aria-label="Choose Music Folder"
        >
          <span className="text-sm" aria-hidden="true">📁</span>
          <span>Choose Folder</span>
        </button>

        <button
          type="button"
          onClick={() => void handleChooseFiles()}
          className="flex-1 min-w-[160px] px-5 py-2.5 bg-[#121215] hover:bg-[#1a1a1f] border border-[#27272a] text-zinc-200 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer rounded-none flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none hw-btn active:translate-y-[1px]"
          aria-label="Choose Audio Files"
        >
          <span className="text-sm" aria-hidden="true">🎵</span>
          <span>Choose Files</span>
        </button>
      </div>

      {/* Manual Path Input & Scan Action */}
      <div className="w-full max-w-md mt-3.5 flex flex-col sm:flex-row items-center gap-1.5">
        <input
          type="text"
          value={folderPathInput}
          onChange={(e) => setFolderPathInput(e.target.value)}
          placeholder="C:/Music or /path/to/tracks"
          aria-label="Music folder path"
          className="flex-1 w-full px-3 py-1.5 bg-[#09090b] border border-[#27272a] text-xs text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 placeholder-zinc-600 font-mono"
        />
        <button
          type="button"
          onClick={() => onScanFolder(folderPathInput)}
          disabled={isLoading || !folderPathInput.trim()}
          aria-label="Scan Folder"
          className="w-full sm:w-auto px-4 py-1.5 bg-[#18181b] hover:bg-[#222226] disabled:opacity-40 border border-[#27272a] text-zinc-200 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none hw-btn active:translate-y-[1px]"
        >
          {isLoading ? 'Scanning...' : 'Scan Folder'}
        </button>
      </div>

      {/* Immediate Demo & 5K Benchmark Explorations */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-zinc-400 font-mono">
        <span>Immediate exploration:</span>
        {onReload && (
          <>
            <button
              type="button"
              onClick={onReload}
              className="text-amber-400 hover:text-amber-300 underline cursor-pointer font-bold focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none"
            >
              Reload Database (SQLite)
            </button>
            <span className="text-zinc-600">·</span>
          </>
        )}
        <button
          type="button"
          onClick={onLoadDemo}
          className="text-zinc-400 hover:text-white underline cursor-pointer focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none"
        >
          Load Demo Library (40 Tracks)
        </button>
        <span className="text-zinc-600">·</span>
        <button
          type="button"
          onClick={onLoadBenchmark}
          className="text-zinc-400 hover:text-white underline cursor-pointer focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none"
        >
          5,000 Tracks Benchmark
        </button>
      </div>

      {/* Supported Audio Codecs Strip */}
      <div className="flex flex-wrap items-center justify-center gap-1 mt-4 text-xs text-zinc-500 font-mono">
        {['WAV', 'FLAC', 'MP3', 'AIFF', 'M4A', 'OGG'].map((ext) => (
          <span key={ext} className="px-2 py-0.5 border border-[#27272a] bg-[#09090b]">
            {ext}
          </span>
        ))}
      </div>

      {/* Feature Highlights Grid (Preserves exact test labels) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full mt-6 text-left border-t border-[#27272a] pt-5">
        <div className="p-3 bg-[#09090b] border border-[#27272a]">
          <div className="text-zinc-200 font-bold text-xs uppercase tracking-wider">
            Local & Read-Only
          </div>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Zero cloud telemetry. Audio files are strictly read-only and never modified.
          </p>
        </div>

        <div className="p-3 bg-[#09090b] border border-[#27272a]">
          <div className="text-zinc-200 font-bold text-xs uppercase tracking-wider">
            Pure Rust DSP
          </div>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Deterministic beat tracking, 24-key Camelot harmonics, and loudness standards.
          </p>
        </div>

        <div className="p-3 bg-[#09090b] border border-[#27272a]">
          <div className="text-zinc-200 font-bold text-xs uppercase tracking-wider">
            Hardware Ready
          </div>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Full export to Rekordbox XML, standard M3U8 playlists, and Markdown/CSV sheets.
          </p>
        </div>
      </div>
    </div>
  );
};
