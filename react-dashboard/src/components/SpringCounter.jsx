import React from 'react';

/**
 * SpringCounter
 * Lightweight, zero-overhead KPI metric display without expensive drop-shadow filters
 * or continuous spring physics loops.
 */
export default function SpringCounter({
  value,
  suffix = '',
  colorClass = 'text-slate-900'
}) {
  return (
    <div
      className={`text-3xl xl:text-4xl font-bold tracking-tight ${colorClass} inline-flex items-baseline select-none transition-colors duration-200`}
    >
      <span>{value}</span>
      {suffix && (
        <span className="text-lg xl:text-xl font-medium text-slate-500 ml-1">
          {suffix}
        </span>
      )}
    </div>
  );
}
