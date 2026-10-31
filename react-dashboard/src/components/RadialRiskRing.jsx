import React from 'react';

/**
 * RadialRiskRing
 * Renders an SVG radial progress ring with glowing threat bar
 * and large typography (text-3xl font-black)
 */
export default function RadialRiskRing({ score = 78, size = 68, strokeWidth = 5 }) {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  const isHighThreat = score >= 90;
  const isAmbiguous = score >= 50 && score < 90;

  const ringColor = isHighThreat ? '#f43f5e' : isAmbiguous ? '#fbbf24' : '#10b981';
  const glowColor = isHighThreat ? 'rgba(244, 63, 94, 0.4)' : 'rgba(251, 191, 36, 0.35)';

  return (
    <div className="flex items-center gap-3">
      {/* SVG Radial Progress Ring */}
      <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
        <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
          {/* Background circle track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(51, 65, 85, 0.4)"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Animated Glowing Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            fill="transparent"
            style={{
              filter: `drop-shadow(0 0 6px ${glowColor})`,
              transition: 'stroke-dashoffset 0.8s ease-in-out'
            }}
          />
        </svg>

        {/* Center score mini label */}
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-black text-slate-400">
          RISK
        </div>
      </div>

      {/* Numerical score & threat rating */}
      <div>
        <div className="flex items-baseline gap-0.5">
          <span
            className={`text-3xl xl:text-4xl font-black font-mono tracking-tight ${
              isHighThreat ? 'text-rose-400' : 'text-amber-400'
            }`}
            style={{
              filter: `drop-shadow(0 0 12px ${glowColor})`
            }}
          >
            {score}
          </span>
          <span
            className={`text-sm font-black font-mono ${
              isHighThreat ? 'text-rose-400/80' : 'text-amber-500/80'
            }`}
          >
            %
          </span>
        </div>

        {/* Mini glowing threat bar */}
        <div className="w-20 h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden border border-slate-700/60">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              isHighThreat
                ? 'bg-gradient-to-r from-rose-500 to-red-600 shadow-[0_0_8px_rgba(244,63,94,0.6)]'
                : 'bg-gradient-to-r from-amber-400 to-orange-500 shadow-[0_0_8px_rgba(251,191,36,0.5)]'
            }`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
    </div>
  );
}
