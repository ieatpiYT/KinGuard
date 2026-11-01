import React from 'react';

/**
 * RadialRiskRing
 * Clean, accessible SVG circular indicator using the KinGuard logo palette
 * (#6A8B5E Sage Green, #FD7A2C Heart Orange, #DC2626 High-Threat Red).
 */
export default function RadialRiskRing({ score = 78, size = 56, strokeWidth = 5 }) {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  const isHighThreat = score >= 90;
  const isAmbiguous = score >= 50 && score < 90;

  const ringColor = isHighThreat ? '#dc2626' : isAmbiguous ? '#FD7A2C' : '#6A8B5E';
  const labelText = isHighThreat ? 'High risk' : isAmbiguous ? 'Review' : 'Low risk';

  return (
    <div className="flex items-center gap-2.5" aria-label={`Risk score ${score} percent (${labelText})`}>
      <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
        <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#E5E0C8"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
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
            style={{ transition: 'stroke-dashoffset 0.4s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-[#18365A]">
          {score}%
        </div>
      </div>

      <div className="hidden sm:block">
        <div
          className={`text-xs font-bold ${
            isHighThreat ? 'text-rose-700' : isAmbiguous ? 'text-[#C24E0A]' : 'text-[#4F6B45]'
          }`}
        >
          {labelText}
        </div>
        <div className="text-[11px] text-slate-500">Confidence</div>
      </div>
    </div>
  );
}
