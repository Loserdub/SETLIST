import React from 'react';
import { flexRender, type Table, type Row, type HeaderGroup, type Header } from '@tanstack/react-table';
import type { Track } from '../../../bindings/Track';
import type { ProgressEvent } from '../../../api';
import { IconArrowUp, IconArrowDown, IconArrowUpDown } from '../../../components/icons';
import { EmptyLibraryView } from '../EmptyLibraryView';
import { LibraryTableRow } from './LibraryTableRow';

export interface LibraryTableProps {
  tableContainerRef: React.RefObject<HTMLDivElement | null>;
  handleTableKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  isLoadingTracks: boolean;
  activeDatasetLength: number;
  progress: ProgressEvent | null;
  handleChooseFolder: () => void;
  scanFolder: (path: string) => void;
  setUseMockBackend: (useMock: boolean) => void;
  loadTracks: () => void;
  toggleBenchmarkMode: () => void;
  rowsLength: number;
  resetFilters: () => void;
  table: Table<Track>;
  columnsLength: number;
  paddingTop: number;
  paddingBottom: number;
  itemsToRender: { row: Row<Track>; index: number }[];
  focusedRowIndex: number | null;
  setFocusedRowIndex: (idx: number) => void;
  handleRowClick: (trackId: string) => void;
}

export const LibraryTable: React.FC<LibraryTableProps> = ({
  tableContainerRef,
  handleTableKeyDown,
  isLoadingTracks,
  activeDatasetLength,
  progress,
  handleChooseFolder,
  scanFolder,
  setUseMockBackend,
  loadTracks,
  toggleBenchmarkMode,
  rowsLength,
  resetFilters,
  table,
  columnsLength,
  paddingTop,
  paddingBottom,
  itemsToRender,
  focusedRowIndex,
  setFocusedRowIndex,
  handleRowClick,
}) => {
  const handleItemClick = React.useCallback(
    (trackId: string, index: number) => {
      setFocusedRowIndex(index);
      handleRowClick(trackId);
    },
    [setFocusedRowIndex, handleRowClick]
  );

  const handleItemFocus = React.useCallback(
    (index: number) => {
      setFocusedRowIndex(index);
    },
    [setFocusedRowIndex]
  );

  return (
    <div
      ref={tableContainerRef}
      data-testid="virtual-table-container"
      tabIndex={0}
      onKeyDown={handleTableKeyDown}
      className="flex-1 overflow-y-auto relative focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      role="region"
      aria-label="Track list"
    >
      {isLoadingTracks && activeDatasetLength === 0 ? (
        <div
          data-testid="library-loading"
          className="h-96 flex flex-col items-center justify-center text-center p-8 m-6"
        >
          <div className="w-6 h-6 border border-border-strong border-t-white rounded-none animate-spin mb-4" />
          <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-300">
            {progress
              ? `${progress.stage.toUpperCase()}: ${progress.message ?? 'Analyzing tracks...'}`
              : 'Loading Library...'}
          </h3>
          <p className="text-xs font-mono text-zinc-400 mt-1 max-w-sm">
            Connecting to local SQLite database and reading audio analysis metadata.
          </p>
        </div>
      ) : activeDatasetLength === 0 ? (
        <EmptyLibraryView
          onChooseFolder={handleChooseFolder}
          onScanFolder={(path) => void scanFolder(path)}
          onLoadDemo={() => {
            setUseMockBackend(true);
            void loadTracks();
          }}
          onLoadBenchmark={toggleBenchmarkMode}
          onReload={() => void loadTracks()}
          isLoading={isLoadingTracks}
        />
      ) : rowsLength === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-center p-8 border border-border-base bg-surface-panel m-6">
          <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-300">
            No matching tracks
          </h3>
          <p className="text-xs font-mono text-zinc-400 max-w-sm mt-1 mb-4">
            Adjust search query, BPM range, or Camelot key filter.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="hw-btn px-3 py-1 bg-surface-raised hover:bg-surface-elevated border border-border-base text-zinc-300 hover:text-white text-xs font-mono uppercase transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px]"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <table className="w-full border-collapse text-left select-none text-xs bg-surface-deep">
          {/* Sticky Table Header */}
          <thead className="sticky top-0 z-10 bg-surface-panel border-b border-border-base">
            {table.getHeaderGroups().map((headerGroup: HeaderGroup<Track>) => (
              <tr key={headerGroup.id} className="h-9">
                {headerGroup.headers.map((header: Header<Track, unknown>) => {
                  const canSort = header.column.getCanSort();
                  const sortDirection = header.column.getIsSorted();

                  return (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      onClick={header.column.getToggleSortingHandler()}
                      className={`px-3 py-1.5 text-xs font-mono font-medium uppercase tracking-wider text-zinc-300 ${
                        canSort ? 'cursor-pointer hover:text-white select-none' : ''
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {canSort && (
                          <span className="text-xs text-zinc-400 font-mono flex items-center">
                            {sortDirection === 'asc' ? (
                              <IconArrowUp size={11} className="text-zinc-200" />
                            ) : sortDirection === 'desc' ? (
                              <IconArrowDown size={11} className="text-zinc-200" />
                            ) : (
                              <IconArrowUpDown size={11} className="text-zinc-500" />
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          {/* Virtualized Body with dynamic padding offsets */}
          <tbody>
            {paddingTop > 0 && (
              <tr>
                <td style={{ height: `${paddingTop}px` }} colSpan={columnsLength} />
              </tr>
            )}

            {itemsToRender.map(({ row, index }) => {
              const isSelected = row.getIsSelected();
              const isFocused = focusedRowIndex === index;

              return (
                <LibraryTableRow
                  key={row.id}
                  row={row}
                  index={index}
                  isFocused={isFocused}
                  isSelected={isSelected}
                  onRowClick={handleItemClick}
                  onRowFocus={handleItemFocus}
                />
              );
            })}

            {paddingBottom > 0 && (
              <tr>
                <td style={{ height: `${paddingBottom}px` }} colSpan={columnsLength} />
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};
