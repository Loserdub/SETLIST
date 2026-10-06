import React from 'react';
import { flexRender, type Row, type Cell } from '@tanstack/react-table';
import type { Track } from '../../../bindings/Track';

export interface LibraryTableRowProps {
  row: Row<Track>;
  index: number;
  isFocused: boolean;
  isSelected: boolean;
  onRowClick: (trackId: string, index: number) => void;
  onRowFocus: (index: number) => void;
}

export const LibraryTableRow: React.FC<LibraryTableRowProps> = React.memo(
  ({ row, index, isFocused, isSelected, onRowClick, onRowFocus }) => {
    return (
      <tr
        key={row.id}
        data-index={index}
        tabIndex={0}
        role="row"
        aria-selected={isFocused || isSelected}
        onClick={() => onRowClick(row.original.id, index)}
        onFocus={() => onRowFocus(index)}
        className={`hw-row group h-[52px] border-b border-border-subtle transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset ${
          isFocused
            ? 'bg-surface-elevated border-l-2 border-l-zinc-300 ring-1 ring-inset ring-zinc-600/50 is-active'
            : isSelected
            ? 'bg-surface-raised border-l-2 border-l-amber-500'
            : 'hover:bg-surface-raised'
        }`}
      >
        {row.getVisibleCells().map((cell: Cell<Track, unknown>) => (
          <td
            key={cell.id}
            style={{ width: cell.column.getSize() }}
            className="px-3 py-1.5 text-xs text-zinc-300 align-middle"
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>
    );
  }
);

LibraryTableRow.displayName = 'LibraryTableRow';
