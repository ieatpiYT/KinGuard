import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * SpringCounter
 * Displays high-impact KPI numbers (text-5xl xl:text-6xl font-black tracking-tight)
 * with Framer Motion spring counter animations and glowing drop-shadows
 */
export default function SpringCounter({
  value,
  suffix = '',
  colorClass = 'text-white',
  glowFilter = 'drop-shadow-[0_0_20px_rgba(16,185,129,0.25)]'
}) {
  const [isChanged, setIsChanged] = useState(false);
  const [prevValue, setPrevValue] = useState(value);

  useEffect(() => {
    if (value !== prevValue) {
      setPrevValue(value);
      setIsChanged(true);
      const timer = setTimeout(() => setIsChanged(false), 650);
      return () => clearTimeout(timer);
    }
  }, [value, prevValue]);

  return (
    <motion.div
      animate={isChanged ? { scale: [1, 1.18, 0.96, 1], y: [0, -4, 1, 0] } : { scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 450, damping: 22 }}
      className={`text-5xl xl:text-6xl font-black tracking-tight font-mono ${colorClass} ${glowFilter} inline-flex items-baseline select-none`}
    >
      <span>{value}</span>
      {suffix && (
        <span className="text-2xl xl:text-3xl font-bold text-slate-400 ml-1 font-mono">
          {suffix}
        </span>
      )}
    </motion.div>
  );
}
