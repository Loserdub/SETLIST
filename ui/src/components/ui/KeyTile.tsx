import React from 'react';

export interface KeyTileProps {
  camelotKey: string;
  size?: 'sm' | 'md' | 'lg';
  overridden?: boolean;
  className?: string;
  dataTestId?: string;
}

const CAMELOT_VARS: Record<string, { bg: string; text: string }> = {
  '1A': { bg: 'var(--camelot-1a)', text: 'var(--text-primary)' },
  '1B': { bg: 'var(--camelot-1b)', text: 'var(--accent-text)' },
  '2A': { bg: 'var(--camelot-2a)', text: 'var(--text-primary)' },
  '2B': { bg: 'var(--camelot-2b)', text: 'var(--accent-text)' },
  '3A': { bg: 'var(--camelot-3a)', text: 'var(--text-primary)' },
  '3B': { bg: 'var(--camelot-3b)', text: 'var(--text-primary)' },
  '4A': { bg: 'var(--camelot-4a)', text: 'var(--text-primary)' },
  '4B': { bg: 'var(--camelot-4b)', text: 'var(--text-primary)' },
  '5A': { bg: 'var(--camelot-5a)', text: 'var(--text-primary)' },
  '5B': { bg: 'var(--camelot-5b)', text: 'var(--text-primary)' },
  '6A': { bg: 'var(--camelot-6a)', text: 'var(--text-primary)' },
  '6B': { bg: 'var(--camelot-6b)', text: 'var(--text-primary)' },
  '7A': { bg: 'var(--camelot-7a)', text: 'var(--text-primary)' },
  '7B': { bg: 'var(--camelot-7b)', text: 'var(--text-primary)' },
  '8A': { bg: 'var(--camelot-8a)', text: 'var(--text-primary)' },
  '8B': { bg: 'var(--camelot-8b)', text: 'var(--text-primary)' },
  '9A': { bg: 'var(--camelot-9a)', text: 'var(--text-primary)' },
  '9B': { bg: 'var(--camelot-9b)', text: 'var(--text-primary)' },
  '10A': { bg: 'var(--camelot-10a)', text: 'var(--text-primary)' },
  '10B': { bg: 'var(--camelot-10b)', text: 'var(--accent-text)' },
  '11A': { bg: 'var(--camelot-11a)', text: 'var(--text-primary)' },
  '11B': { bg: 'var(--camelot-11b)', text: 'var(--accent-text)' },
  '12A': { bg: 'var(--camelot-12a)', text: 'var(--text-primary)' },
  '12B': { bg: 'var(--camelot-12b)', text: 'var(--accent-text)' },
};

export const KeyTile: React.FC<KeyTileProps> = ({
  camelotKey,
  size = 'md',
  overridden = false,
  className = '',
  dataTestId,
}) => {
  const normalizedKey = camelotKey.trim().toUpperCase();
  const config = CAMELOT_VARS[normalizedKey] ?? {
    bg: 'var(--surface-raised)',
    text: 'var(--text-secondary)',
  };

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs min-w-[28px]',
    md: 'px-2 py-0.5 text-xs min-w-[32px]',
    lg: 'px-2.5 py-1 text-sm min-w-[38px]',
  }[size];

  return (
    <span
      data-testid={dataTestId}
      style={{
        backgroundColor: config.bg,
        color: config.text,
      }}
      className={`inline-flex items-center justify-center font-mono font-bold uppercase rounded-[2px] select-none tracking-tight leading-none ${sizeClasses} ${className}`}
      title={overridden ? `Key: ${normalizedKey} (Edited)` : `Key: ${normalizedKey}`}
    >
      {normalizedKey}
    </span>
  );
};
