import React, { useEffect, useRef } from 'react';

/**
 * CursorReactiveBackground
 *
 * Implements:
 * 1. Soft blurred gradient orbs reacting smoothly to cursor direction with physics lerp
 * 2. Soft cursor-following glow behind the interface (large blur, low opacity, text readability preserved)
 * 3. Floating light particles with ambient motion
 * 4. Cursor-reactive background lighting that subtly follows mouse movement
 * 5. Touch / mobile and prefers-reduced-motion fallback
 */
export const CursorReactiveBackground: React.FC = () => {
  const glowRef = useRef<HTMLDivElement>(null);
  const orb1Ref = useRef<HTMLDivElement>(null);
  const orb2Ref = useRef<HTMLDivElement>(null);
  const orb3Ref = useRef<HTMLDivElement>(null);
  const orb4Ref = useRef<HTMLDivElement>(null);
  const meshLightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check if user prefers reduced motion or is on a touch device
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isTouch = window.matchMedia('(pointer: coarse)').matches;

    if (prefersReducedMotion || isTouch) {
      // In touch/reduced-motion mode, keep default subtle ambient positions without RAF tracking
      return;
    }

    let rafId: number;
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let currentX = targetX;
    let currentY = targetY;

    let normTargetX = 0;
    let normTargetY = 0;
    let currentNormX = 0;
    let currentNormY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      // Normalized between -1 and 1
      normTargetX = (e.clientX - w / 2) / (w / 2);
      normTargetY = (e.clientY - h / 2) / (h / 2);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    // Smooth physics loop with gentle lerp damping for a slight, silky delay
    const animate = () => {
      const lerp = 0.055;
      currentX += (targetX - currentX) * lerp;
      currentY += (targetY - currentY) * lerp;

      currentNormX += (normTargetX - currentNormX) * lerp;
      currentNormY += (normTargetY - currentNormY) * lerp;

      // 1. Soft cursor-following glow (smoothly follows cursor with large blur)
      if (glowRef.current) {
        glowRef.current.style.transform = `translate3d(${currentX - 250}px, ${currentY - 250}px, 0)`;
      }

      // 2. Cursor-reactive background lighting
      if (meshLightRef.current) {
        meshLightRef.current.style.background = `radial-gradient(850px circle at ${currentX}px ${currentY}px, rgba(16, 185, 129, 0.07), rgba(56, 189, 248, 0.04) 40%, transparent 75%)`;
      }

      // 3. Ambient Orbs shifting with cursor direction:
      // When cursor moves LEFT -> orbs shift LEFT
      // When cursor moves RIGHT -> orbs shift RIGHT
      // When cursor moves UP -> orbs shift UP
      // When cursor moves DOWN -> orbs shift DOWN
      if (orb1Ref.current) {
        // Emerald aurora orb
        const shiftX = currentNormX * 55;
        const shiftY = currentNormY * 45;
        orb1Ref.current.style.transform = `translate3d(${shiftX}px, ${shiftY}px, 0)`;
      }

      if (orb2Ref.current) {
        // Azure sky orb
        const shiftX = currentNormX * 42;
        const shiftY = currentNormY * 38;
        orb2Ref.current.style.transform = `translate3d(${shiftX}px, ${shiftY}px, 0)`;
      }

      if (orb3Ref.current) {
        // Sunlight warm pear orb (subtle opposing depth parallax)
        const shiftX = currentNormX * 30;
        const shiftY = currentNormY * 26;
        orb3Ref.current.style.transform = `translate3d(${shiftX}px, ${shiftY}px, 0)`;
      }

      if (orb4Ref.current) {
        // Fresh spring mint orb
        const shiftX = currentNormX * 48;
        const shiftY = currentNormY * 40;
        orb4Ref.current.style.transform = `translate3d(${shiftX}px, ${shiftY}px, 0)`;
      }

      // Update CSS variables for any children that desire cursor awareness
      document.documentElement.style.setProperty('--cursor-norm-x', currentNormX.toFixed(4));
      document.documentElement.style.setProperty('--cursor-norm-y', currentNormY.toFixed(4));

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 transition-opacity duration-1000"
      aria-hidden="true"
    >
      {/* 1. Global Interactive Cursor-Followed Mesh Lighting */}
      <div
        ref={meshLightRef}
        className="absolute inset-0 transition-opacity duration-300 opacity-90"
        style={{
          background:
            'radial-gradient(850px circle at 50% 30%, rgba(16, 185, 129, 0.06), rgba(56, 189, 248, 0.03) 40%, transparent 75%)',
        }}
      />

      {/* 2. Soft Cursor Glow - low opacity, large blur, blend naturally, never obscures text */}
      <div
        ref={glowRef}
        className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full pointer-events-none will-change-transform"
        style={{
          background:
            'radial-gradient(circle, rgba(16, 185, 129, 0.16) 0%, rgba(56, 189, 248, 0.12) 35%, rgba(125, 211, 252, 0.05) 60%, transparent 75%)',
          filter: 'blur(95px)',
          opacity: 0.85,
          transform: 'translate3d(-250px, -250px, 0)',
        }}
      />

      {/* 3. Blurred Gradient Orbs */}
      {/* Orb 1: Fresh Emerald Green (Top Left) */}
      <div
        ref={orb1Ref}
        className="absolute -top-24 -left-24 w-[550px] h-[550px] rounded-full pointer-events-none will-change-transform animate-ambient-float-1"
        style={{
          background:
            'radial-gradient(circle, rgba(0, 107, 44, 0.16) 0%, rgba(16, 185, 129, 0.12) 40%, rgba(52, 211, 153, 0.04) 70%, transparent 80%)',
          filter: 'blur(100px)',
        }}
      />

      {/* Orb 2: Azure Morning Mist (Top Right) */}
      <div
        ref={orb2Ref}
        className="absolute top-12 -right-28 w-[520px] h-[520px] rounded-full pointer-events-none will-change-transform animate-ambient-float-2"
        style={{
          background:
            'radial-gradient(circle, rgba(56, 189, 248, 0.15) 0%, rgba(99, 102, 241, 0.09) 45%, rgba(147, 197, 253, 0.03) 70%, transparent 80%)',
          filter: 'blur(95px)',
        }}
      />

      {/* Orb 3: Warm Golden Sunlight / Citrus Glow (Center/Bottom Left) */}
      <div
        ref={orb3Ref}
        className="absolute top-1/2 -left-20 w-[460px] h-[460px] rounded-full pointer-events-none will-change-transform animate-ambient-float-3"
        style={{
          background:
            'radial-gradient(circle, rgba(245, 158, 11, 0.11) 0%, rgba(251, 191, 36, 0.07) 35%, rgba(16, 185, 129, 0.04) 65%, transparent 80%)',
          filter: 'blur(90px)',
        }}
      />

      {/* Orb 4: Vibrant Mint / Clean Botanical (Bottom Right) */}
      <div
        ref={orb4Ref}
        className="absolute -bottom-20 right-10 w-[540px] h-[540px] rounded-full pointer-events-none will-change-transform animate-ambient-float-1"
        style={{
          background:
            'radial-gradient(circle, rgba(16, 185, 129, 0.14) 0%, rgba(45, 212, 191, 0.10) 45%, rgba(125, 211, 252, 0.03) 70%, transparent 80%)',
          filter: 'blur(100px)',
        }}
      />

      {/* 4. Subtle Floating Light Particles / Sparkles */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Particle 1 */}
        <div
          className="absolute top-[18%] left-[22%] w-2 h-2 rounded-full bg-emerald-400/40 blur-[1px] animate-float-particle-1"
          style={{ animationDuration: '14s' }}
        />
        {/* Particle 2 */}
        <div
          className="absolute top-[35%] right-[28%] w-2.5 h-2.5 rounded-full bg-sky-400/35 blur-[1.5px] animate-float-particle-2"
          style={{ animationDuration: '18s' }}
        />
        {/* Particle 3 */}
        <div
          className="absolute top-[65%] left-[15%] w-3 h-3 rounded-full bg-teal-300/30 blur-[2px] animate-float-particle-3"
          style={{ animationDuration: '22s' }}
        />
        {/* Particle 4 */}
        <div
          className="absolute top-[75%] right-[20%] w-2 h-2 rounded-full bg-amber-300/35 blur-[1px] animate-float-particle-1"
          style={{ animationDuration: '16s' }}
        />
        {/* Particle 5 */}
        <div
          className="absolute top-[48%] left-[55%] w-1.5 h-1.5 rounded-full bg-emerald-300/45 blur-[0.8px] animate-float-particle-2"
          style={{ animationDuration: '20s' }}
        />
        {/* Particle 6 */}
        <div
          className="absolute top-[88%] left-[40%] w-2.5 h-2.5 rounded-full bg-sky-300/30 blur-[1.5px] animate-float-particle-3"
          style={{ animationDuration: '25s' }}
        />
      </div>

      {/* 5. Delicate Glass Depth Grid / Specular Sheen Overlay */}
      <div
        className="absolute inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(rgba(11, 28, 48, 0.4) 1px, transparent 1px), radial-gradient(rgba(11, 28, 48, 0.4) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          backgroundPosition: '0 0, 20px 20px',
        }}
      />
    </div>
  );
};
