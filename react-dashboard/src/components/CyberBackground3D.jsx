import React, { useEffect, useRef } from 'react';

/**
 * CyberBackground3D
 * Renders an interactive 3D HTML5 Canvas with:
 * 1. Perspective cyber-grid horizon moving forward in 3D
 * 2. 3D floating neural constellation nodes with mouse-parallax depth
 * 3. Dynamic ambient aurora light pools that morph on system state:
 *    - 'normal': Cyber Emerald & Deep Indigo
 *    - 'ambiguous': Plasma Amber
 *    - 'scrubbed': Crimson Laser
 */
export default function CyberBackground3D({ systemState = 'normal' }) {
  const canvasRef = useRef(null);
  const mousePos = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const setupDpi = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
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

    const handleMouseMove = (e) => {
      mousePos.current.targetX = (e.clientX / window.innerWidth - 0.5) * 60;
      mousePos.current.targetY = (e.clientY / window.innerHeight - 0.5) * 40;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);

    // 3D Neural Constellation Nodes
    const particleCount = 45;
    const particles = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: (Math.random() - 0.5) * 1600,
        y: (Math.random() - 0.5) * 1000 - 80,
        z: Math.random() * 800 + 100,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.3,
        vz: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 2 + 1
      });
    }

    // Grid animation state (normalized seamless cycle 0..1)
    let gridOffset = 0;

    // Color transition interpolation with pre-parsed RGB tuples
    const stateColors = {
      normal: {
        grid: 'rgba(99, 102, 241, 0.14)',
        glow: 'rgba(16, 185, 129, 0.15)',
        node: 'rgba(129, 140, 248, 0.8)',
        lineRgb: [99, 102, 241]
      },
      ambiguous: {
        grid: 'rgba(245, 158, 11, 0.22)',
        glow: 'rgba(245, 158, 11, 0.25)',
        node: 'rgba(251, 191, 36, 0.95)',
        lineRgb: [245, 158, 11]
      },
      scrubbed: {
        grid: 'rgba(244, 63, 94, 0.26)',
        glow: 'rgba(225, 29, 72, 0.3)',
        node: 'rgba(251, 113, 133, 0.95)',
        lineRgb: [244, 63, 94]
      }
    };

    const render = () => {
      // Ease mouse tracking
      mousePos.current.x += (mousePos.current.targetX - mousePos.current.x) * 0.05;
      mousePos.current.y += (mousePos.current.targetY - mousePos.current.y) * 0.05;

      ctx.fillStyle = '#03050c';
      ctx.fillRect(0, 0, width, height);

      const activeColor = stateColors[systemState] || stateColors.normal;

      // --- 1. PERSPECTIVE CYBER-GRID HORIZON (Seamless Infinite 3D Motion) ---
      gridOffset = (gridOffset + 0.012) % 1.0;
      const horizonY = height * 0.72;
      const vanishingX = width * 0.5 + mousePos.current.x * 0.6;

      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = activeColor.grid;
      ctx.lineWidth = 1;

      // Horizon line
      ctx.moveTo(0, horizonY);
      ctx.lineTo(width, horizonY);

      // Perspective lines from vanishing point
      const linesCount = 28;
      for (let i = -linesCount; i <= linesCount; i++) {
        const spreadX = vanishingX + (i * width) / (linesCount * 0.85);
        ctx.moveTo(vanishingX, horizonY);
        ctx.lineTo(spreadX, height + 60);
      }

      // Horizontal lines with exponential perspective projection
      const totalGridLines = 18;
      for (let z = 1; z < totalGridLines; z++) {
        const progress = (z + gridOffset) / totalGridLines;
        const y = horizonY + Math.pow(progress, 2.2) * (height - horizonY);
        if (y <= height + 20) {
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
        }
      }
      ctx.stroke();

      // Atmospheric gradient fade near horizon
      const horizonGradient = ctx.createLinearGradient(0, horizonY - 120, 0, horizonY + 160);
      horizonGradient.addColorStop(0, '#03050c');
      horizonGradient.addColorStop(0.45, 'rgba(3, 5, 12, 0.85)');
      horizonGradient.addColorStop(1, 'rgba(3, 5, 12, 0)');
      ctx.fillStyle = horizonGradient;
      ctx.fillRect(0, horizonY - 120, width, 280);
      ctx.restore();

      // --- 2. 3D FLOATING NEURAL CONSTELLATION ---
      const fov = 450;
      const centerX = width / 2 + mousePos.current.x;
      const centerY = height * 0.42 + mousePos.current.y;

      const projected = [];

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;

        // Wrap particles around 3D bounding volume
        if (p.x < -800) p.x = 800;
        if (p.x > 800) p.x = -800;
        if (p.y < -500) p.y = 500;
        if (p.y > 500) p.y = -500;
        if (p.z < 60) p.z = 850;
        if (p.z > 850) p.z = 60;

        const scale = fov / (fov + p.z);
        const projX = centerX + p.x * scale;
        const projY = centerY + p.y * scale;

        projected.push({
          x: projX,
          y: projY,
          radius: p.radius * scale * 1.6,
          alpha: Math.min(1, Math.max(0.1, (1 - p.z / 850) * 0.9))
        });
      }

      // Draw constellation lines with fast zero-regex RGB formatting
      ctx.save();
      const [lr, lg, lb] = activeColor.lineRgb;
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const dx = projected[i].x - projected[j].x;
          const dy = projected[i].y - projected[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 110) {
            const lineAlpha = (1 - dist / 110) * 0.28 * projected[i].alpha;
            ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, ${lineAlpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(projected[i].x, projected[i].y);
            ctx.lineTo(projected[j].x, projected[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw constellation nodes
      for (let i = 0; i < projected.length; i++) {
        const pt = projected[i];
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(0.8, pt.radius), 0, Math.PI * 2);
        ctx.fillStyle = activeColor.node;
        ctx.shadowColor = activeColor.node;
        ctx.shadowBlur = 10;
        ctx.fill();
      }
      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [systemState]);

  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden bg-[#03050c]">
      {/* HTML5 Interactive 3D Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* Dynamic Ambient Aurora Glow Pools */}
      {systemState === 'normal' && (
        <>
          <div className="absolute -top-32 left-1/4 w-[600px] h-[500px] rounded-full bg-emerald-500/12 blur-[150px] transition-all duration-1000 animate-pulse" />
          <div className="absolute top-1/3 -right-20 w-[650px] h-[550px] rounded-full bg-indigo-600/15 blur-[160px] transition-all duration-1000" />
          <div className="absolute -bottom-20 left-1/3 w-[500px] h-[450px] rounded-full bg-cyan-600/10 blur-[140px] transition-all duration-1000" />
        </>
      )}

      {systemState === 'ambiguous' && (
        <>
          <div className="absolute top-1/4 left-1/3 w-[750px] h-[600px] rounded-full bg-amber-500/22 blur-[160px] transition-all duration-700 animate-pulse" />
          <div className="absolute -top-20 right-1/4 w-[600px] h-[500px] rounded-full bg-orange-600/18 blur-[150px] transition-all duration-700" />
        </>
      )}

      {systemState === 'scrubbed' && (
        <>
          <div className="absolute top-1/4 left-1/4 w-[800px] h-[650px] rounded-full bg-rose-600/25 blur-[160px] transition-all duration-500 animate-pulse" />
          <div className="absolute bottom-10 right-1/4 w-[650px] h-[550px] rounded-full bg-red-700/20 blur-[150px] transition-all duration-500" />
        </>
      )}

      {/* Subtle radial vignette */}
      <div className="absolute inset-0 bg-radial-gradient pointer-events-none opacity-40 bg-[radial-gradient(ellipse_at_center,transparent_0%,#03050c_80%)]" />
    </div>
  );
}
