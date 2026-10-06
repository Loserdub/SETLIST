import React, { useEffect, useState, useCallback } from 'react';
import { isTauriEnvironment } from '../../api';

interface DropZoneOverlayProps {
  onDropPaths: (paths: string[]) => void;
  onDropFiles?: (files: File[]) => void;
  children: React.ReactNode;
  className?: string;
}

export const DropZoneOverlay: React.FC<DropZoneOverlayProps> = ({
  onDropPaths,
  onDropFiles,
  children,
  className,
}) => {
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Tauri Desktop Window Drag/Drop Listener
  useEffect(() => {
    if (!isTauriEnvironment()) return;

    let unlisten: (() => void) | undefined;
    let isMounted = true;

    import('@tauri-apps/api/webviewWindow')
      .then(({ getCurrentWebviewWindow }) => {
        if (!isMounted) return;
        const currentWin = getCurrentWebviewWindow();
        return currentWin.onDragDropEvent((event) => {
          const payload = event.payload;
          if (payload.type === 'enter' || payload.type === 'over') {
            setIsDraggingOver(true);
          } else if (payload.type === 'leave') {
            setIsDraggingOver(false);
          } else if (payload.type === 'drop') {
            setIsDraggingOver(false);
            if (payload.paths && payload.paths.length > 0) {
              onDropPaths(payload.paths);
            }
          }
        });
      })
      .then((cleanupFn) => {
        if (isMounted) {
          unlisten = cleanupFn;
        } else if (cleanupFn) {
          cleanupFn();
        }
      })
      .catch((err) => {
        console.debug('Tauri drag drop listener unattached:', err);
      });

    return () => {
      isMounted = false;
      if (unlisten) unlisten();
    };
  }, [onDropPaths]);

  // Standard HTML5 Drag & Drop handlers (for browser / mock mode or web drop)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only deactivate if leaving the container itself
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        // In Electron/Node/Tauri, file objects may have a .path property
        const paths = droppedFiles
          .map((f) => (f as unknown as { path?: string }).path)
          .filter((p): p is string => Boolean(p));

        if (paths.length > 0) {
          onDropPaths(paths);
        } else if (onDropFiles) {
          onDropFiles(droppedFiles);
        }
      }
    },
    [onDropPaths, onDropFiles]
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={className ?? "relative flex-1 flex flex-col h-full overflow-hidden"}
    >
      {children}

      {/* Boutique Drag-and-Drop Active Overlay */}
      {isDraggingOver && (
        <div
          data-testid="dropzone-active-overlay"
          className="absolute inset-0 z-50 bg-surface-deep/95 backdrop-blur-md flex flex-col items-center justify-center p-8 select-none border-2 border-dashed border-amber-500/80 animate-in fade-in duration-150 font-mono"
        >
          <div className="relative z-10 flex flex-col items-center text-center max-w-xl space-y-4">
            {/* Precision Hardware Drop Target Reticle */}
            <div className="w-16 h-16 border-2 border-amber-500 flex items-center justify-center bg-surface-raised shadow-[0_0_15px_rgba(245,158,11,0.2)]">
              <span className="text-2xl text-amber-400 font-bold">↓</span>
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-mono font-bold uppercase tracking-widest text-zinc-100">
                DROP AUDIO FILES OR FOLDERS HERE
              </h3>
              <p className="text-xs font-mono text-zinc-400">
                Instant recursive inspection, BLAKE3 content hashing, and pure Rust DSP analysis
              </p>
            </div>

            {/* Ingestion Workflow Progression */}
            <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider py-1.5 px-3 bg-surface-raised border border-border-base text-amber-300">
              <span>DROP AUDIO</span>
              <span className="text-zinc-600">→</span>
              <span className="text-zinc-300">ANALYZE</span>
              <span className="text-zinc-600">→</span>
              <span className="text-amber-400">UNDERSTAND</span>
              <span className="text-zinc-600">→</span>
              <span className="text-emerald-400">CATALOG</span>
            </div>

            {/* Supported Formats Indicator */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2 text-xs font-mono text-content-muted">
              {['WAV', 'FLAC', 'MP3', 'AIFF', 'M4A', 'OGG', '24-BIT HIGH-RES'].map((fmt) => (
                <span
                  key={fmt}
                  className="px-2 py-0.5 border border-border-subtle bg-surface-panel text-content-muted"
                >
                  {fmt}
                </span>
              ))}
            </div>

            <p className="text-xs font-mono text-content-muted pt-2">
              Source audio is strictly read-only and never modified or renamed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
