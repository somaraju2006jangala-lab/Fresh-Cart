import React, { useEffect, useRef } from 'react';

/**
 * CursorReactiveBackground
 *
 * Clean White Particle Floating Background:
 * - Pure field of floating white particles with subtle opacity variation and depth
 * - Dark black / deep navy background
 * - Calm, gentle natural floating movement
 * - Subtle cursor repel interaction (nearby particles gently move away and smoothly return)
 * - Complete removal of nucleus, orbits, ripples, cursor rings, and colorful orbs
 * - Non-interactive canvas layer (pointer-events: none, z-index: 0) behind all UI
 * - Full responsive and prefers-reduced-motion support
 */

interface WhiteParticle {
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  driftPhase: number;
  driftSpeed: number;
  driftAmp: number;
  sizeTier: 'small' | 'medium' | 'large';
  radius: number;
  baseAlpha: number;
  alphaPhase: number;
  alphaSpeed: number;
  currentAlpha: number;
  offsetX: number;
  offsetY: number;
  targetOffsetX: number;
  targetOffsetY: number;
}

export const CursorReactiveBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;

    // Retina / High-DPI scaling
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });

    // Accessibility and Touch preferences
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let prefersReducedMotion = motionQuery.matches;
    const handleMotionChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
    };
    motionQuery.addEventListener('change', handleMotionChange);

    const isTouch = window.matchMedia('(pointer: coarse)').matches;

    // Particle pool creation
    const createParticle = (x?: number, y?: number): WhiteParticle => {
      const rand = Math.random();
      let sizeTier: 'small' | 'medium' | 'large';
      let radius: number;
      let baseAlpha: number;

      // Distribution: ~70% small, ~22% medium, ~8% slightly larger
      if (rand < 0.70) {
        sizeTier = 'small';
        radius = 1.8 + Math.random() * 0.8; // 1.8 - 2.6px (clearly visible small dots)
        baseAlpha = 0.38 + Math.random() * 0.35; // 0.38 - 0.73
      } else if (rand < 0.92) {
        sizeTier = 'medium';
        radius = 3.0 + Math.random() * 1.2; // 3.0 - 4.2px (clearly visible medium dots)
        baseAlpha = 0.48 + Math.random() * 0.32; // 0.48 - 0.80
      } else {
        sizeTier = 'large';
        radius = 4.8 + Math.random() * 1.2; // 4.8 - 6.0px (subtle larger dots, non-bubble)
        baseAlpha = 0.55 + Math.random() * 0.28; // 0.55 - 0.83
      }

      // Gentle natural drift velocity
      const speed = 0.12 + Math.random() * 0.24;
      const angle = Math.random() * Math.PI * 2;

      return {
        baseX: x ?? Math.random() * width,
        baseY: y ?? Math.random() * height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.75 - 0.04,
        driftPhase: Math.random() * Math.PI * 2,
        driftSpeed: 0.25 + Math.random() * 0.45,
        driftAmp: 0.12 + Math.random() * 0.18,
        sizeTier,
        radius,
        baseAlpha,
        alphaPhase: Math.random() * Math.PI * 2,
        alphaSpeed: 0.8 + Math.random() * 1.2,
        currentAlpha: baseAlpha,
        offsetX: 0,
        offsetY: 0,
        targetOffsetX: 0,
        targetOffsetY: 0,
      };
    };

    // Responsive particle count: ~95-110 on desktop, ~50-60 on tablet, ~30-40 on mobile
    const calculateTargetCount = (w: number, h: number): number => {
      const area = w * h;
      let count = Math.round(area / 19000);
      if (isTouch) {
        count = Math.min(count, 45);
      }
      return Math.max(28, Math.min(115, count));
    };

    const targetCount = calculateTargetCount(width, height);
    const particles: WhiteParticle[] = [];
    for (let i = 0; i < targetCount; i++) {
      particles.push(createParticle());
    }

    // Cursor tracking state
    let targetMouseX = -9999;
    let targetMouseY = -9999;
    let smoothMouseX = -9999;
    let smoothMouseY = -9999;
    let isPointerActive = false;

    const handlePointerMove = (e: PointerEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
      if (!isPointerActive) {
        smoothMouseX = e.clientX;
        smoothMouseY = e.clientY;
      }
      isPointerActive = true;
    };

    const handlePointerLeave = () => {
      isPointerActive = false;
      targetMouseX = -9999;
      targetMouseY = -9999;
    };

    if (!isTouch) {
      window.addEventListener('pointermove', handlePointerMove, { passive: true });
      window.addEventListener('pointerleave', handlePointerLeave, { passive: true });
      window.addEventListener('blur', handlePointerLeave, { passive: true });
    }

    let lastTime = performance.now();

    const render = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.05);
      lastTime = currentTime;
      const step = Math.min(dt * 60, 2.0);

      // Smooth cursor coordinate interpolation
      if (isPointerActive) {
        smoothMouseX += (targetMouseX - smoothMouseX) * 0.18;
        smoothMouseY += (targetMouseY - smoothMouseY) * 0.18;
      }

      // 1. Draw Deep Black / Deep Navy Background
      ctx.fillStyle = '#030305';
      ctx.fillRect(0, 0, width, height);

      const bgGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.45,
        60,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.85
      );
      bgGrad.addColorStop(0, '#070c18'); // subtle deep navy center
      bgGrad.addColorStop(0.45, '#04070e');
      bgGrad.addColorStop(1, '#020305');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Cursor repulsion parameters
      const interactionRadius = 140;
      const interactionRadiusSq = interactionRadius * interactionRadius;
      const maxRepel = 38;
      const margin = 30;

      // 3. Update & Draw Particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (!prefersReducedMotion) {
          // A. Calm natural floating motion
          p.driftPhase += p.driftSpeed * dt;
          const waveX = Math.cos(p.driftPhase) * p.driftAmp * step;
          const waveY = Math.sin(p.driftPhase * 0.8) * p.driftAmp * step;

          p.baseX += (p.vx * step) + waveX;
          p.baseY += (p.vy * step) + waveY;

          // Seamless edge wrapping
          if (p.baseX < -margin) p.baseX = width + margin;
          if (p.baseX > width + margin) p.baseX = -margin;
          if (p.baseY < -margin) p.baseY = height + margin;
          if (p.baseY > height + margin) p.baseY = -margin;

          // Opacity breathing
          p.alphaPhase += p.alphaSpeed * dt;
          p.currentAlpha = Math.max(
            0.20,
            Math.min(0.90, p.baseAlpha + Math.sin(p.alphaPhase) * 0.08)
          );

          // B. Gentle cursor interaction (nearby particles move away and smoothly return)
          if (isPointerActive && !isTouch) {
            const currentPosX = p.baseX + p.offsetX;
            const currentPosY = p.baseY + p.offsetY;
            const dx = currentPosX - smoothMouseX;
            const dy = currentPosY - smoothMouseY;
            const distSq = dx * dx + dy * dy;

            if (distSq < interactionRadiusSq && distSq > 0.01) {
              const dist = Math.sqrt(distSq);
              const factor = 1 - dist / interactionRadius;
              const repel = factor * factor * maxRepel;

              p.targetOffsetX = (dx / dist) * repel;
              p.targetOffsetY = (dy / dist) * repel;
            } else {
              p.targetOffsetX = 0;
              p.targetOffsetY = 0;
            }
          } else {
            p.targetOffsetX = 0;
            p.targetOffsetY = 0;
          }

          // Smooth spring/damping return to target offset
          p.offsetX += (p.targetOffsetX - p.offsetX) * 0.08;
          p.offsetY += (p.targetOffsetY - p.offsetY) * 0.08;
        }

        const drawX = p.baseX + p.offsetX;
        const drawY = p.baseY + p.offsetY;

        // C. Render Clean White Particle (no bubbles, no stars, no trails, no rings)
        if (p.sizeTier === 'large') {
          // Subtle feathered edge for larger particles to prevent harsh bubble appearance
          const grad = ctx.createRadialGradient(drawX, drawY, 0, drawX, drawY, p.radius);
          grad.addColorStop(0, `rgba(255, 255, 255, ${p.currentAlpha.toFixed(3)})`);
          grad.addColorStop(0.75, `rgba(255, 255, 255, ${(p.currentAlpha * 0.85).toFixed(3)})`);
          grad.addColorStop(1, `rgba(255, 255, 255, ${(p.currentAlpha * 0.20).toFixed(3)})`);
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = `rgba(255, 255, 255, ${p.currentAlpha.toFixed(3)})`;
        }

        ctx.beginPath();
        ctx.arc(drawX, drawY, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      motionQuery.removeEventListener('change', handleMotionChange);
      if (!isTouch) {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerleave', handlePointerLeave);
        window.removeEventListener('blur', handlePointerLeave);
      }
    };
  }, []);

  return (
    <div
      id="global-particle-background"
      className="fixed inset-0 w-screen h-screen pointer-events-none overflow-hidden z-0"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 0,
      }}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="fixed inset-0 block w-full h-full pointer-events-none z-0"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
    </div>
  );
};
