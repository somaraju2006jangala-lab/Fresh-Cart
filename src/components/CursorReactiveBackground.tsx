import React, { useEffect, useRef } from 'react';

/**
 * CursorReactiveBackground
 *
 * GLOBAL BLACK TRANSPARENT LIQUID-GLASS THEME
 *
 * 1. Deep Black / Near-Black Transparent Liquid-Glass Foundation (#010302 / #020503)
 * 2. Multi-layer Viscous Liquid Glass Caustic Ribbons with subtle emerald refraction
 * 3. Morphing Organic Black Liquid Glass Bodies with 3D specular rim reflections
 * 4. Interactive Specular Cursor Sheen tracking pointer across full viewport
 * 5. Liquid Glass Distortion Ripples responding to cursor dynamics
 * 6. Suspended Microscopic Liquid Glass Droplets with restrained emerald glints
 * 7. High-DPI 60fps Canvas rendering, zero containing block for fixed elements,
 *    and full prefers-reduced-motion accessibility support.
 */

interface LiquidBlob {
  baseXRatio: number;
  baseYRatio: number;
  x: number;
  y: number;
  baseRadius: number;
  harmonics: Array<{ freq: number; amp: number; speed: number; phase: number }>;
  rotation: number;
  rotationSpeed: number;
  stretch: number;
  stretchAngle: number;
  colorCore: string;
  colorMid: string;
  colorRim: string;
  specularColor: string;
}

interface LiquidRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  speed: number;
  opacity: number;
  thickness: number;
}

interface GlassDroplet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseAlpha: number;
  pulsePhase: number;
  color: string;
}

export const CursorReactiveBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Device Pixel Ratio scaling for crystal-clear Retina display rendering
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });

    // Accessibility and Touch checks
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isTouch = window.matchMedia('(pointer: coarse)').matches;

    // Mouse tracking state across entire screen
    let mouseX = width * 0.5;
    let mouseY = height * 0.5;
    let targetMouseX = width * 0.5;
    let targetMouseY = height * 0.5;

    let normX = 0;
    let normY = 0;
    let targetNormX = 0;
    let targetNormY = 0;

    // Specular liquid reflection coordinates with smooth lerp
    let sheenX = width * 0.5;
    let sheenY = height * 0.35;

    // Liquid ripple distortion waves
    const ripples: LiquidRipple[] = [];
    let lastRippleX = width * 0.5;
    let lastRippleY = height * 0.5;

    // Smooth scroll velocity tracking to keep liquid physically continuous during scrolling
    let scrollVelocity = 0;
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const delta = Math.abs(currentScrollY - lastScrollY);
      scrollVelocity = Math.min(delta * 0.04, 3);
      lastScrollY = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      targetNormX = (e.clientX - w / 2) / (w / 2);
      targetNormY = (e.clientY - h / 2) / (h / 2);

      // Liquid glass distortion ripples on cursor movement
      const distFromLastRipple = Math.hypot(e.clientX - lastRippleX, e.clientY - lastRippleY);
      if (distFromLastRipple > 42 && !prefersReducedMotion) {
        lastRippleX = e.clientX;
        lastRippleY = e.clientY;
        const velocity = Math.min(distFromLastRipple * 0.12, 5);
        ripples.push({
          x: e.clientX,
          y: e.clientY,
          radius: 12,
          maxRadius: Math.min(160 + velocity * 22, 260),
          speed: 2.2 + velocity * 0.3,
          opacity: Math.min(0.28 + velocity * 0.04, 0.42),
          thickness: 1.2 + Math.random() * 0.8,
        });

        if (ripples.length > 18) {
          ripples.shift();
        }
      }
    };

    if (!isTouch) {
      window.addEventListener('mousemove', handleMouseMove, { passive: true });
    }

    // 1. Organic Black Liquid Glass Blobs
    // Distributed to create depth behind header, hero, catalog, and footer
    const blobs: LiquidBlob[] = [
      {
        baseXRatio: 0.5,
        baseYRatio: 0.16,
        x: width * 0.5,
        y: height * 0.16,
        baseRadius: 320,
        harmonics: [
          { freq: 2, amp: 28, speed: 0.38, phase: 0 },
          { freq: 3, amp: 18, speed: -0.28, phase: 1.4 },
          { freq: 5, amp: 10, speed: 0.48, phase: 2.9 },
        ],
        rotation: 0,
        rotationSpeed: 0.00028,
        stretch: 1,
        stretchAngle: 0,
        colorCore: 'rgba(2, 6, 4, 0.42)',
        colorMid: 'rgba(4, 12, 8, 0.68)',
        colorRim: 'rgba(16, 185, 129, 0.13)',
        specularColor: 'rgba(255, 255, 255, 0.10)',
      },
      {
        baseXRatio: 0.14,
        baseYRatio: 0.22,
        x: width * 0.14,
        y: height * 0.22,
        baseRadius: 280,
        harmonics: [
          { freq: 2, amp: 24, speed: -0.32, phase: 0.8 },
          { freq: 4, amp: 15, speed: 0.42, phase: 2.1 },
        ],
        rotation: 1.2,
        rotationSpeed: -0.00024,
        stretch: 1,
        stretchAngle: 0,
        colorCore: 'rgba(3, 8, 5, 0.38)',
        colorMid: 'rgba(5, 14, 9, 0.64)',
        colorRim: 'rgba(16, 185, 129, 0.11)',
        specularColor: 'rgba(110, 231, 183, 0.08)',
      },
      {
        baseXRatio: 0.86,
        baseYRatio: 0.24,
        x: width * 0.86,
        y: height * 0.24,
        baseRadius: 290,
        harmonics: [
          { freq: 3, amp: 25, speed: 0.35, phase: 1.5 },
          { freq: 5, amp: 12, speed: -0.38, phase: 3.2 },
        ],
        rotation: 2.4,
        rotationSpeed: 0.00026,
        stretch: 1,
        stretchAngle: 0,
        colorCore: 'rgba(2, 7, 5, 0.40)',
        colorMid: 'rgba(4, 13, 8, 0.66)',
        colorRim: 'rgba(52, 211, 153, 0.12)',
        specularColor: 'rgba(255, 255, 255, 0.09)',
      },
      {
        baseXRatio: 0.5,
        baseYRatio: 0.52,
        x: width * 0.5,
        y: height * 0.52,
        baseRadius: 360,
        harmonics: [
          { freq: 2, amp: 30, speed: 0.32, phase: 0.5 },
          { freq: 3, amp: 20, speed: -0.36, phase: 1.8 },
          { freq: 4, amp: 12, speed: 0.44, phase: 3.4 },
        ],
        rotation: 0.6,
        rotationSpeed: -0.00022,
        stretch: 1,
        stretchAngle: 0,
        colorCore: 'rgba(3, 8, 5, 0.44)',
        colorMid: 'rgba(5, 15, 10, 0.70)',
        colorRim: 'rgba(16, 185, 129, 0.14)',
        specularColor: 'rgba(255, 255, 255, 0.11)',
      },
      {
        baseXRatio: 0.12,
        baseYRatio: 0.68,
        x: width * 0.12,
        y: height * 0.68,
        baseRadius: 310,
        harmonics: [
          { freq: 3, amp: 24, speed: 0.4, phase: 2.3 },
          { freq: 5, amp: 14, speed: -0.32, phase: 0.9 },
        ],
        rotation: 1.8,
        rotationSpeed: 0.00025,
        stretch: 1,
        stretchAngle: 0,
        colorCore: 'rgba(2, 6, 4, 0.38)',
        colorMid: 'rgba(4, 12, 8, 0.65)',
        colorRim: 'rgba(16, 185, 129, 0.12)',
        specularColor: 'rgba(110, 231, 183, 0.08)',
      },
      {
        baseXRatio: 0.88,
        baseYRatio: 0.72,
        x: width * 0.88,
        y: height * 0.72,
        baseRadius: 330,
        harmonics: [
          { freq: 2, amp: 26, speed: -0.35, phase: 1.1 },
          { freq: 4, amp: 16, speed: 0.42, phase: 2.7 },
        ],
        rotation: 3.1,
        rotationSpeed: -0.00024,
        stretch: 1,
        stretchAngle: 0,
        colorCore: 'rgba(3, 8, 5, 0.42)',
        colorMid: 'rgba(5, 14, 9, 0.68)',
        colorRim: 'rgba(52, 211, 153, 0.13)',
        specularColor: 'rgba(255, 255, 255, 0.09)',
      },
      {
        baseXRatio: 0.5,
        baseYRatio: 0.88,
        x: width * 0.5,
        y: height * 0.88,
        baseRadius: 340,
        harmonics: [
          { freq: 2, amp: 25, speed: 0.34, phase: 0.3 },
          { freq: 3, amp: 18, speed: -0.38, phase: 2.2 },
        ],
        rotation: 0.4,
        rotationSpeed: 0.00022,
        stretch: 1,
        stretchAngle: 0,
        colorCore: 'rgba(2, 6, 4, 0.40)',
        colorMid: 'rgba(4, 12, 8, 0.66)',
        colorRim: 'rgba(16, 185, 129, 0.12)',
        specularColor: 'rgba(255, 255, 255, 0.09)',
      },
    ];

    // 2. Suspended Microscopic Liquid Glass Droplets
    const droplets: GlassDroplet[] = [];
    const dropletCount = isTouch ? 22 : 45;

    for (let i = 0; i < dropletCount; i++) {
      droplets.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.22,
        vy: -0.15 - Math.random() * 0.25,
        size: 1.2 + Math.random() * 2.2,
        baseAlpha: 0.12 + Math.random() * 0.26,
        pulsePhase: Math.random() * Math.PI * 2,
        color: i % 3 === 0 ? 'rgba(16, 185, 129, 0.75)' : 'rgba(255, 255, 255, 0.65)',
      });
    }

    let lastTime = performance.now();

    // 3. Main 60fps Render Loop
    const render = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;
      const timeSec = currentTime * 0.001;

      // Smooth cursor lerp
      const lerpFactor = prefersReducedMotion ? 0.03 : 0.07;
      mouseX += (targetMouseX - mouseX) * lerpFactor;
      mouseY += (targetMouseY - mouseY) * lerpFactor;
      normX += (targetNormX - normX) * lerpFactor;
      normY += (targetNormY - normY) * lerpFactor;

      // Sheen reflection position smoothly tracking cursor with slight inertia
      sheenX += (mouseX - sheenX) * 0.05;
      sheenY += (mouseY - sheenY) * 0.05;

      scrollVelocity *= 0.92;

      ctx.clearRect(0, 0, width, height);

      // --- LAYER A: Flowing Viscous Liquid Glass Caustic Ribbons ---
      const ribbonCount = 4;
      for (let r = 0; r < ribbonCount; r++) {
        const yOffsetRatio = 0.2 + r * 0.24;
        const baseY = height * yOffsetRatio;
        const waveSpeed = prefersReducedMotion ? 0.1 : 0.35 + r * 0.12;
        const waveAmp = (25 + r * 14) * (1 + scrollVelocity * 0.3);
        const freq = 0.0018 + r * 0.0006;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, baseY);

        const segments = 40;
        const segWidth = width / segments;

        for (let s = 0; s <= segments; s++) {
          const px = s * segWidth;
          const harmonic1 = Math.sin(px * freq + timeSec * waveSpeed + r) * waveAmp;
          const harmonic2 = Math.cos(px * freq * 1.8 - timeSec * (waveSpeed * 0.8)) * (waveAmp * 0.45);
          const py = baseY + harmonic1 + harmonic2 + normY * (18 + r * 8);
          if (s === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }

        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();

        // Viscous dark glass gradient with emerald refraction rim
        const ribbonGrad = ctx.createLinearGradient(0, baseY - waveAmp, 0, baseY + waveAmp * 3);
        ribbonGrad.addColorStop(0, `rgba(16, 185, 129, ${0.035 + r * 0.015})`);
        ribbonGrad.addColorStop(0.15, `rgba(4, 12, 8, ${0.12 + r * 0.04})`);
        ribbonGrad.addColorStop(0.65, `rgba(2, 5, 3, ${0.22 + r * 0.05})`);
        ribbonGrad.addColorStop(1, 'transparent');

        ctx.fillStyle = ribbonGrad;
        ctx.fill();

        // Delicate specular rim along the crest of the liquid glass wave
        ctx.lineWidth = 1.0 + (r === 1 ? 0.5 : 0);
        ctx.strokeStyle = r % 2 === 0
          ? 'rgba(16, 185, 129, 0.10)'
          : 'rgba(255, 255, 255, 0.07)';
        ctx.stroke();

        ctx.restore();
      }

      // --- LAYER B: Morphing Organic Black Liquid Glass Blobs ---
      blobs.forEach((blob) => {
        // Subtle organic float + cursor pull
        const floatX = prefersReducedMotion ? 0 : Math.sin(timeSec * 0.5 + blob.rotation) * 16;
        const floatY = prefersReducedMotion ? 0 : Math.cos(timeSec * 0.4 + blob.rotation) * 18;

        const targetX = width * blob.baseXRatio + normX * 36 + floatX;
        const targetY = height * blob.baseYRatio + normY * 36 + floatY;

        blob.x += (targetX - blob.x) * 0.06;
        blob.y += (targetY - blob.y) * 0.06;

        if (!prefersReducedMotion) {
          blob.rotation += blob.rotationSpeed;
        }

        // Draw organic liquid contour
        const points = 48;
        ctx.beginPath();

        for (let p = 0; p <= points; p++) {
          const theta = (p / points) * Math.PI * 2;
          let r = blob.baseRadius;

          if (!prefersReducedMotion) {
            blob.harmonics.forEach((h) => {
              r += Math.sin(theta * h.freq + timeSec * h.speed + h.phase) * h.amp;
            });
          }

          // Gentle reactive bulging toward cursor
          const distToCursor = Math.hypot(mouseX - blob.x, mouseY - blob.y);
          if (distToCursor < 380) {
            const pullFactor = Math.max(0, 1 - distToCursor / 380) * 22;
            const angleToCursor = Math.atan2(mouseY - blob.y, mouseX - blob.x);
            const angleDiff = Math.cos(theta - angleToCursor);
            if (angleDiff > 0) {
              r += angleDiff * pullFactor;
            }
          }

          const px = blob.x + Math.cos(theta + blob.rotation) * r;
          const py = blob.y + Math.sin(theta + blob.rotation) * r;

          if (p === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }

        ctx.closePath();

        // 3D Glass Radial Shading
        const blobGrad = ctx.createRadialGradient(
          blob.x - blob.baseRadius * 0.25,
          blob.y - blob.baseRadius * 0.25,
          blob.baseRadius * 0.1,
          blob.x,
          blob.y,
          blob.baseRadius * 1.05
        );
        blobGrad.addColorStop(0, blob.colorCore);
        blobGrad.addColorStop(0.55, blob.colorMid);
        blobGrad.addColorStop(0.92, 'rgba(1, 3, 2, 0.88)');
        blobGrad.addColorStop(1, 'transparent');

        ctx.fillStyle = blobGrad;
        ctx.fill();

        // Emerald liquid glass rim refraction
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = blob.colorRim;
        ctx.stroke();

        // Glossy crescent specular highlight on upper glass curvature
        ctx.save();
        ctx.beginPath();
        const specRadius = blob.baseRadius * 0.72;
        const specCenterX = blob.x - blob.baseRadius * 0.22;
        const specCenterY = blob.y - blob.baseRadius * 0.24;

        ctx.ellipse(specCenterX, specCenterY, specRadius * 0.55, specRadius * 0.25, -Math.PI / 6, 0, Math.PI * 2);
        const specGrad = ctx.createLinearGradient(
          specCenterX - specRadius * 0.3,
          specCenterY - specRadius * 0.15,
          specCenterX + specRadius * 0.3,
          specCenterY + specRadius * 0.15
        );
        specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.0)');
        specGrad.addColorStop(0.5, blob.specularColor);
        specGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');

        ctx.fillStyle = specGrad;
        ctx.fill();
        ctx.restore();
      });

      // --- LAYER C: Interactive Specular Liquid Glass Light Reflection ---
      // A soft, elegant light source reflecting across the curved liquid glass
      const sheenRadius = 420;
      const sheenGrad = ctx.createRadialGradient(
        sheenX,
        sheenY,
        0,
        sheenX,
        sheenY,
        sheenRadius
      );
      sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
      sheenGrad.addColorStop(0.2, 'rgba(16, 185, 129, 0.06)');
      sheenGrad.addColorStop(0.5, 'rgba(5, 150, 105, 0.025)');
      sheenGrad.addColorStop(1, 'transparent');

      ctx.fillStyle = sheenGrad;
      ctx.beginPath();
      ctx.arc(sheenX, sheenY, sheenRadius, 0, Math.PI * 2);
      ctx.fill();

      // --- LAYER D: Liquid Glass Distortion Ripples ---
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rip = ripples[i];
        rip.radius += rip.speed;
        rip.opacity -= 0.007;

        if (rip.opacity <= 0 || rip.radius >= rip.maxRadius) {
          ripples.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(rip.x, rip.y, rip.radius, 0, Math.PI * 2);
        ctx.lineWidth = rip.thickness;
        ctx.strokeStyle = `rgba(16, 185, 129, ${rip.opacity * 0.65})`;
        ctx.stroke();

        // Inner secondary refraction ring
        ctx.beginPath();
        ctx.arc(rip.x, rip.y, Math.max(0, rip.radius - 4), 0, Math.PI * 2);
        ctx.lineWidth = rip.thickness * 0.6;
        ctx.strokeStyle = `rgba(255, 255, 255, ${rip.opacity * 0.45})`;
        ctx.stroke();
        ctx.restore();
      }

      // --- LAYER E: Suspended Microscopic Liquid Glass Droplets ---
      droplets.forEach((d) => {
        d.y += d.vy;
        d.x += d.vx;

        if (d.y < -10) {
          d.y = height + 10;
          d.x = Math.random() * width;
        }
        if (d.x < -10) d.x = width + 10;
        if (d.x > width + 10) d.x = -10;

        const pulse = prefersReducedMotion ? 0 : Math.sin(timeSec * 2.2 + d.pulsePhase) * 0.08;
        const alpha = Math.max(0.04, Math.min(0.48, d.baseAlpha + pulse));

        ctx.fillStyle = d.color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
        ctx.fill();

        // Specular micro-center
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div
      id="global-black-liquid-background"
      className="fixed inset-0 w-screen h-screen pointer-events-none overflow-hidden z-0 transition-opacity duration-1000"
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
      {/* 1. Underlying Atmospheric Ambient Deep Black Liquid Glass Gradients */}
      <div
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          background:
            'radial-gradient(1300px circle at 50% 12%, rgba(16, 185, 129, 0.05), transparent 55%), radial-gradient(1100px circle at 80% 65%, rgba(5, 150, 105, 0.035), transparent 60%), radial-gradient(900px circle at 20% 85%, rgba(16, 185, 129, 0.03), transparent 60%), #010302',
        }}
      />

      {/* 2. Interactive Viscous Black Liquid Glass & Caustics Canvas */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 block w-full h-full pointer-events-none z-0 will-change-transform"
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

      {/* 3. Subtle Liquid Glass Specular Highlight Sheen */}
      <div
        className="absolute inset-0 w-full h-full pointer-events-none opacity-40"
        style={{
          background:
            'linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, transparent 45%, rgba(16, 185, 129, 0.015) 75%, transparent 100%)',
        }}
      />
    </div>
  );
};
