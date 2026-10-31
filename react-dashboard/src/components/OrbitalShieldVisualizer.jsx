import React, { useEffect, useRef } from 'react';
import { Shield, Radio, Activity, Zap, Lock } from 'lucide-react';

/**
 * OrbitalShieldVisualizer
 * A live horizontal Zero-UI Telemetry & Shield Wave Bar
 * featuring:
 * 1. Animated dual-wave oscilloscope (PCM audio & AI threat resonance)
 * 2. Multi-ring rotating orbital shield node
 * 3. Reactive visual triggers:
 *    - 'ambiguous': Amber shockwave ripples across oscilloscope
 *    - 'scrubbed': Crimson laser pulse vaporizes an incoming threat node
 */
export default function OrbitalShieldVisualizer({ triggerEvent = 'idle' }) {
  const canvasRef = useRef(null);

  const eventType = typeof triggerEvent === 'object' ? triggerEvent.type : triggerEvent;
  const eventTimestamp = typeof triggerEvent === 'object' ? triggerEvent.timestamp : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId;
    let width = 500;
    let height = 100;

    const setupDpi = () => {
      if (!canvas || !canvas.parentElement) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.parentElement.getBoundingClientRect();
      width = Math.max(300, Math.floor(rect.width));
      height = 95;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    setupDpi();

    const handleResize = () => {
      setupDpi();
    };

    window.addEventListener('resize', handleResize);

    let phase = 0;
    let shockwaveRadius = eventType === 'ambiguous' ? 5 : 0;
    let laserProgress = 0;
    let vaporizationParticles = [];

    // Reset animations whenever eventType or eventTimestamp changes
    if (eventType === 'ambiguous') {
      shockwaveRadius = 5;
    } else if (eventType === 'scrubbed') {
      laserProgress = 0;
      vaporizationParticles = [];
      const nodeX = width * 0.78;
      const nodeY = height / 2;
      for (let i = 0; i < 32; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 1.2;
        vaporizationParticles.push({
          x: nodeX,
          y: nodeY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          size: Math.random() * 3.5 + 1.2
        });
      }
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      phase += 0.055;

      const isAmbiguous = eventType === 'ambiguous';
      const isScrubbed = eventType === 'scrubbed';

      // Background subtle matrix grid
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      ctx.restore();

      const centerY = height / 2;

      // 1. DUAL-WAVE OSCILLOSCOPE (Primary & Harmonic Threat Wave)
      const waveColorPrimary = isScrubbed
        ? 'rgba(244, 63, 94, 0.95)'
        : isAmbiguous
        ? 'rgba(245, 158, 11, 0.95)'
        : 'rgba(16, 185, 129, 0.9)';

      const waveColorSecondary = isScrubbed
        ? 'rgba(251, 113, 133, 0.5)'
        : isAmbiguous
        ? 'rgba(253, 230, 138, 0.5)'
        : 'rgba(99, 102, 241, 0.6)';

      const ampMultiplier = isAmbiguous ? 2.2 : isScrubbed ? 1.8 : 1.0;

      // Secondary Wave (Harmonic threat analysis wave)
      ctx.beginPath();
      ctx.strokeStyle = waveColorSecondary;
      ctx.lineWidth = 1.5;
      for (let x = 0; x < width; x += 3) {
        const freq = 0.022;
        const y =
          centerY +
          Math.sin(x * freq + phase * 1.4) * 12 * ampMultiplier +
          Math.cos(x * 0.04 - phase * 0.8) * 6 * ampMultiplier;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Primary Wave (48kHz audio stream VAD)
      ctx.beginPath();
      ctx.strokeStyle = waveColorPrimary;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = waveColorPrimary;
      ctx.shadowBlur = 12;

      for (let x = 0; x < width; x += 2) {
        const freq = isAmbiguous ? 0.038 : 0.028;
        const envelope = Math.sin((x / width) * Math.PI); // tapering edges
        const y =
          centerY +
          (Math.sin(x * freq - phase * 2) * 16 * ampMultiplier +
            Math.sin(x * 0.015 + phase) * 8 * ampMultiplier) *
            envelope;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0; // reset

      // 2. ORBITAL SHIELD RADAR NODE (Centered at width * 0.22)
      const shieldX = width * 0.16;
      const shieldY = centerY;
      const shieldRadius = 26;

      ctx.save();
      // Outer segmented ring
      ctx.beginPath();
      ctx.strokeStyle = isScrubbed
        ? 'rgba(244, 63, 94, 0.7)'
        : isAmbiguous
        ? 'rgba(245, 158, 11, 0.8)'
        : 'rgba(16, 185, 129, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.arc(shieldX, shieldY, shieldRadius, phase * 1.5, phase * 1.5 + Math.PI * 1.4);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(shieldX, shieldY, shieldRadius, phase * 1.5 + Math.PI, phase * 1.5 + Math.PI * 1.8);
      ctx.stroke();

      // Inner counter-rotating ring
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.7)';
      ctx.lineWidth = 1;
      ctx.arc(shieldX, shieldY, shieldRadius - 8, -phase * 2, -phase * 2 + Math.PI * 1.6);
      ctx.stroke();

      // Center glowing beacon
      ctx.beginPath();
      ctx.arc(shieldX, shieldY, 4, 0, Math.PI * 2);
      ctx.fillStyle = isScrubbed ? '#f43f5e' : isAmbiguous ? '#fbbf24' : '#10b981';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 10;
      ctx.fill();

      // Satellite orbiting node
      const satAngle = phase * 2.5;
      const satX = shieldX + Math.cos(satAngle) * (shieldRadius + 4);
      const satY = shieldY + Math.sin(satAngle) * (shieldRadius + 4);
      ctx.beginPath();
      ctx.arc(satX, satY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#818cf8';
      ctx.fill();
      ctx.restore();

      // 3. AMBIGUOUS EVENT: AMBER SHOCKWAVE EXPANSION
      if (isAmbiguous && shockwaveRadius < width * 0.9) {
        shockwaveRadius += 6.5;
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = `rgba(245, 158, 11, ${Math.max(0, 1 - shockwaveRadius / (width * 0.8))})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 15;
        ctx.arc(shieldX, shieldY, shockwaveRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Secondary ripple
        if (shockwaveRadius > 30) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(251, 191, 36, ${Math.max(0, 0.7 - shockwaveRadius / (width * 0.8))})`;
          ctx.lineWidth = 1.5;
          ctx.arc(shieldX, shieldY, shockwaveRadius - 25, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 4. SCRUBBED EVENT: CRIMSON LASER PULSE & NODE VAPORIZATION
      if (isScrubbed) {
        laserProgress += 0.055;
        const targetNodeX = width * 0.78;
        const targetNodeY = centerY;

        if (laserProgress <= 1.0) {
          // Blasting Laser Pulse from shield towards threat node
          ctx.save();
          const currentLaserX = shieldX + (targetNodeX - shieldX) * laserProgress;

          ctx.beginPath();
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.95)';
          ctx.lineWidth = 4;
          ctx.shadowColor = '#f43f5e';
          ctx.shadowBlur = 20;
          ctx.moveTo(shieldX, shieldY);
          ctx.lineTo(currentLaserX, targetNodeY);
          ctx.stroke();

          // Laser core hot white line
          ctx.beginPath();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.moveTo(shieldX, shieldY);
          ctx.lineTo(currentLaserX, targetNodeY);
          ctx.stroke();
          ctx.restore();
        }

        // Draw threat node before being vaporized
        if (laserProgress < 0.7) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(targetNodeX, targetNodeY, 7, 0, Math.PI * 2);
          ctx.fillStyle = '#e11d48';
          ctx.shadowColor = '#f43f5e';
          ctx.shadowBlur = 14;
          ctx.fill();
          ctx.strokeStyle = '#fda4af';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }

        // Vaporization particles
        if (laserProgress >= 0.5) {
          ctx.save();
          for (let i = 0; i < vaporizationParticles.length; i++) {
            const p = vaporizationParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= 0.022;

            if (p.alpha > 0) {
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(244, 63, 94, ${p.alpha})`;
              ctx.shadowColor = '#f43f5e';
              ctx.shadowBlur = 8;
              ctx.fill();
            }
          }
          ctx.restore();
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [eventType, eventTimestamp]);

  return (
    <div className="bg-[#0b0f1c]/90 border border-slate-700/60 rounded-2xl p-4 shadow-xl relative overflow-hidden backdrop-blur-xl">
      {/* Top telemetry status bar */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80 text-xs">
        <div className="flex items-center gap-2 font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-bold text-slate-300 tracking-wider uppercase text-[11px]">
            Live Zero-UI Telemetry &amp; Shield Wave
          </span>
          <span className="hidden sm:inline-block text-[10px] px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            48kHz PCM Stream
          </span>
        </div>

        {/* Dynamic State Indicator */}
        <div className="font-mono text-xs font-bold">
          {eventType === 'scrubbed' ? (
            <span className="text-rose-400 flex items-center gap-1.5 animate-pulse">
              <Zap className="w-3.5 h-3.5" /> CRIMSON LASER SCRUBBED
            </span>
          ) : eventType === 'ambiguous' ? (
            <span className="text-amber-400 flex items-center gap-1.5 animate-pulse">
              <Activity className="w-3.5 h-3.5" /> AMBER SHOCKWAVE QUARANTINED
            </span>
          ) : (
            <span className="text-emerald-400 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> ORBITAL MATRIX LOCKED
            </span>
          )}
        </div>
      </div>

      {/* HTML5 Oscilloscope & Shield Canvas */}
      <div className="w-full h-[95px] relative">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Bottom Telemetry Metrics Strip */}
      <div className="mt-2 pt-2 border-t border-slate-800/70 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span className="text-slate-300 font-semibold">Screen State:</span> REMAINED OFF
          </span>
          <span className="hidden md:inline text-slate-600">•</span>
          <span className="hidden md:inline">
            <span className="text-slate-300 font-semibold">Dual-Stage VAD:</span> Zero Panic Intercept
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">Threat SLA:</span>
          <span className="text-indigo-400 font-bold">412ms</span>
        </div>
      </div>
    </div>
  );
}
