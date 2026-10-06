import React from 'react';
import { EditedBadge } from '../../track/overrides';

export interface MetricCardProps {
  label: string;
  value: string;
  accentColor?: string;
  isOverridden?: boolean;
  overrideField?: 'bpm' | 'key_camelot';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  accentColor = 'text-white',
  isOverridden,
  overrideField,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-3 bg-surface-panel border border-border-subtle flex-1 min-w-[75px]">
      <span className="te-silkscreen mb-1">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <span
          className={`text-3xl sm:text-4xl lg:text-5xl font-mono font-black te-num tabular-nums tracking-tight ${accentColor}`}
        >
          {value}
        </span>
        {isOverridden && overrideField && (
          <EditedBadge
            field={overrideField}
            title={`${label} analysis overridden`}
          />
        )}
      </div>
    </div>
  );
};
