import React, { useEffect, useRef } from 'react';

/**
 * CursorReactiveBackground
 *
 * GLOBAL FULL-WEBSITE BLACK LIQUID CRYSTAL ANIMATION THEME
 *
 * 1. Global Viewport Fixed Layer:
 *    - Attached at application root with position: fixed; inset: 0; width: 100vw; height: 100vh;
 *    - Covers entire scrollable website from top to bottom
 *    - Stays active and continuous while scrolling with zero restarts or jumps
 * 2. Deep Obsidian Glossy Liquid Crystal Base (#000000, #030305, #08080c)
 * 3. 8 Morphing Organic Black Liquid Crystal Blobs distributed from top to bottom
 * 4. High-tech Liquid Glass Distortion Ripples responding to cursor across entire viewport
 * 5. Full-Screen 3D Orbital Particle System:
 *    - Central quantum nucleus completely FIXED in its original center position
 *    - Expansive 3D elliptical orbits sweeping through top, middle, and bottom of screen
 *    - Satellite quantum cores ensuring permanent luminous activity in upper and lower zones
 *    - Smooth, subtle cursor-originating liquid ripples expanding naturally as cursor moves
 *    - Depth-sorted orbiting particles with light trails
 *    - Ambient quantum crystal sparkles drifting throughout full screen
 * 6. High-DPI 60fps Canvas rendering, zero React re-renders, accessible fallback
 */

interface OrbitDefinition {
  radiusXFactor: number;
  radiusYFactor: number;
  baseRadiusX: number;
  baseRadiusY: number;
  inclinationX: number;
  inclinationZ: number;
  color: string;
  glowColor: string;
}

interface Particle {
  orbitIndex: number;
  angle: number;
  speed: number;
  size: number;
  color: string;
  glowColor: string;
  wobbleOffset: number;
  wobbleSpeed: number;
  history: Array<{ x: number; y: number; alpha: number }>;
}

interface AmbientNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  baseAlpha: number;
  pulsePhase: number;
}

interface SatelliteNode {
  baseXRatio: number;
  baseYRatio: number;
  x: number;
  y: number;
  radius: number;
  particles: Array<{ angle: number; speed: number; dist: number; size: number; color: string }>;
}

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
  targetStretch: number;
  stretchAngle: number;
  targetStretchAngle: number;
  colorCenter: string;
  colorMid: string;
  colorOuter: string;
  rimColor: string;
}

interface LiquidRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  speed: number;
  opacity: number;
  maxOpacity: number;
  thickness: number;
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
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let prefersReducedMotion = motionQuery.matches;
    const handleMotionChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
    };
    motionQuery.addEventListener('change', handleMotionChange);

    const isTouch = window.matchMedia('(pointer: coarse)').matches;

    // Cursor tracking state strictly for the ripple effect and active cursor aura
    let mouseX = width * 0.5;
    let mouseY = height * 0.5;
    let targetMouseX = width * 0.5;
    let targetMouseY = height * 0.5;
    let isPointerActive = false;

    // Liquid ripple distortion waves originating around cursor
    const ripples: LiquidRipple[] = [];
    let lastRippleX = width * 0.5;
    let lastRippleY = height * 0.5;
    let lastRippleTime = performance.now();

    // Spawns smooth, subtle, natural ripples around the cursor position
    const spawnRipple = (clientX: number, clientY: number, strength: number = 1) => {
      if (prefersReducedMotion) return;

      const now = performance.now();
      const distFromLast = Math.hypot(clientX - lastRippleX, clientY - lastRippleY);
      const timeSinceLast = now - lastRippleTime;

      // Only spawn if moved sufficiently or enough time elapsed with movement, or forced (tap/click)
      if (distFromLast < 14 && timeSinceLast < 55 && strength <= 1) {
        return;
      }

      lastRippleX = clientX;
      lastRippleY = clientY;
      lastRippleTime = now;

      const velocity = Math.min(distFromLast * 0.12, 5);
      const baseMaxRadius = 130 + velocity * 22;

      ripples.push({
        x: clientX,
        y: clientY,
        radius: 6,
        maxRadius: Math.min(baseMaxRadius * strength, 240),
        speed: (2.0 + velocity * 0.22) * (0.95 + Math.random() * 0.1),
        opacity: Math.min((0.36 + velocity * 0.04) * strength, 0.52),
        maxOpacity: Math.min((0.36 + velocity * 0.04) * strength, 0.52),
        thickness: 1.35,
      });

      if (ripples.length > 22) {
        ripples.shift();
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
      isPointerActive = true;
      spawnRipple(e.clientX, e.clientY);
    };

    const handlePointerDown = (e: PointerEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
      isPointerActive = true;
      // Tap / click produces a crisp, responsive ripple
      spawnRipple(e.clientX, e.clientY, 1.25);
    };

    const handlePointerLeave = () => {
      isPointerActive = false;
    };

    // Touch event fallback
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        targetMouseX = touch.clientX;
        targetMouseY = touch.clientY;
        isPointerActive = true;
        spawnRipple(touch.clientX, touch.clientY);
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        targetMouseX = touch.clientX;
        targetMouseY = touch.clientY;
        isPointerActive = true;
        spawnRipple(touch.clientX, touch.clientY, 1.25);
      }
    };

    const handleTouchEnd = () => {
      isPointerActive = false;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerleave', handlePointerLeave, { passive: true });

    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    // Smooth scroll velocity tracking to keep liquid physically continuous during scrolling
    let scrollVelocity = 0;
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const delta = Math.abs(currentScrollY - lastScrollY);
      scrollVelocity = Math.min(delta * 0.05, 4);
      lastScrollY = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    // 1. Definition of 6 Expansive 3D Orbital Planes
    // Proportions dynamically sweep through top, middle, and bottom of entire screen
    const orbits: OrbitDefinition[] = [
      {
        radiusXFactor: 0.16,
        radiusYFactor: 0.09,
        baseRadiusX: 160,
        baseRadiusY: 85,
        inclinationX: 0.42,
        inclinationZ: 0.28,
        color: 'rgba(16, 185, 129, 0.22)',
        glowColor: 'rgba(16, 185, 129, 0.45)',
      },
      {
        radiusXFactor: 0.26,
        radiusYFactor: 0.15,
        baseRadiusX: 260,
        baseRadiusY: 135,
        inclinationX: -0.58,
        inclinationZ: -0.52,
        color: 'rgba(56, 189, 248, 0.20)',
        glowColor: 'rgba(56, 189, 248, 0.40)',
      },
      {
        radiusXFactor: 0.38,
        radiusYFactor: 0.22,
        baseRadiusX: 380,
        baseRadiusY: 195,
        inclinationX: 0.95,
        inclinationZ: 0.85,
        color: 'rgba(255, 255, 255, 0.18)',
        glowColor: 'rgba(203, 213, 225, 0.38)',
      },
      {
        radiusXFactor: 0.52,
        radiusYFactor: 0.30,
        baseRadiusX: 520,
        baseRadiusY: 265,
        inclinationX: -0.82,
        inclinationZ: 1.15,
        color: 'rgba(52, 211, 153, 0.19)',
        glowColor: 'rgba(52, 211, 153, 0.38)',
      },
      {
        radiusXFactor: 0.68,
        radiusYFactor: 0.38,
        baseRadiusX: 680,
        baseRadiusY: 345,
        inclinationX: 0.48,
        inclinationZ: -1.25,
        color: 'rgba(241, 245, 249, 0.16)',
        glowColor: 'rgba(255, 255, 255, 0.34)',
      },
      {
        radiusXFactor: 0.85,
        radiusYFactor: 0.48,
        baseRadiusX: 850,
        baseRadiusY: 430,
        inclinationX: -0.32,
        inclinationZ: 1.95,
        color: 'rgba(45, 212, 191, 0.16)',
        glowColor: 'rgba(45, 212, 191, 0.35)',
      },
    ];

    // Restrained luxury palette (Soft white, silver, subtle green, subtle cyan)
    const particleColors = [
      { fill: '#ffffff', glow: 'rgba(255, 255, 255, 0.88)' }, // Pure Crystal White
      { fill: '#cbd5e1', glow: 'rgba(203, 213, 225, 0.82)' }, // Polished Silver
      { fill: '#10b981', glow: 'rgba(16, 185, 129, 0.82)' },  // Restrained Emerald
      { fill: '#34d399', glow: 'rgba(52, 211, 153, 0.85)' },  // Mint Crystal
      { fill: '#38bdf8', glow: 'rgba(56, 189, 248, 0.80)' },  // Subtle Cyan Sky
      { fill: '#e2e8f0', glow: 'rgba(226, 232, 240, 0.85)' }, // Starlight
    ];

    // 2. Initialize orbiting particles (56 on desktop, 26 on mobile)
    const particles: Particle[] = [];
    const particleCount = isTouch ? 26 : 56;

    for (let i = 0; i < particleCount; i++) {
      const orbitIndex = i % orbits.length;
      const col = particleColors[i % particleColors.length];
      const baseAngle = (i / particleCount) * Math.PI * 2 + Math.random() * 0.4;
      const direction = i % 2 === 0 ? 1 : -1;
      const speed = (0.26 + Math.random() * 0.40) * direction * (prefersReducedMotion ? 0.2 : 1);
      const size = 1.6 + Math.random() * 2.4;

      particles.push({
        orbitIndex,
        angle: baseAngle,
        speed,
        size,
        color: col.fill,
        glowColor: col.glow,
        wobbleOffset: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.7 + Math.random() * 1.1,
        history: [],
      });
    }

    // 3. Harmonic Secondary Quantum Satellites (ensures persistent luminous activity in upper & lower quadrants)
    const satellites: SatelliteNode[] = [
      {
        baseXRatio: 0.24,
        baseYRatio: 0.22,
        x: width * 0.24,
        y: height * 0.22,
        radius: 14,
        particles: [
          { angle: 0, speed: 0.6, dist: 55, size: 2.2, color: '#10b981' },
          { angle: Math.PI, speed: 0.6, dist: 55, size: 2.0, color: '#38bdf8' },
          { angle: Math.PI * 0.5, speed: -0.45, dist: 78, size: 1.8, color: '#ffffff' },
        ],
      },
      {
        baseXRatio: 0.78,
        baseYRatio: 0.78,
        x: width * 0.78,
        y: height * 0.78,
        radius: 15,
        particles: [
          { angle: 0.8, speed: 0.55, dist: 60, size: 2.2, color: '#34d399' },
          { angle: 0.8 + Math.PI, speed: 0.55, dist: 60, size: 2.0, color: '#cbd5e1' },
          { angle: -0.4, speed: -0.5, dist: 84, size: 1.9, color: '#ffffff' },
        ],
      },
    ];

    // 4. Initialize ambient floating quantum dust / crystal sparkles across full screen
    const ambientNodes: AmbientNode[] = [];
    const ambientCount = isTouch ? 16 : 36;

    for (let i = 0; i < ambientCount; i++) {
      const col = particleColors[i % particleColors.length];
      ambientNodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.32,
        vy: (Math.random() - 0.5) * 0.32,
        size: 1.3 + Math.random() * 1.9,
        color: col.fill,
        baseAlpha: 0.18 + Math.random() * 0.24,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    // 5. Definition of 8 Organic Black Liquid Crystal Glass Blobs
    // Spans the ENTIRE viewport: Top, Center, Bottom, Left, and Right
    const liquidBlobs: LiquidBlob[] = [
      // Top row
      {
        baseXRatio: 0.50,
        baseYRatio: 0.18,
        x: width * 0.50,
        y: height * 0.18,
        baseRadius: 310,
        harmonics: [
          { freq: 2, amp: 26, speed: 0.42, phase: 0 },
          { freq: 3, amp: 18, speed: -0.32, phase: 1.2 },
          { freq: 5, amp: 12, speed: 0.55, phase: 2.8 },
        ],
        rotation: 0,
        rotationSpeed: 0.00032,
        stretch: 1,
        targetStretch: 1,
        stretchAngle: 0,
        targetStretchAngle: 0,
        colorCenter: 'rgba(18, 25, 38, 0.48)',
        colorMid: 'rgba(8, 12, 19, 0.70)',
        colorOuter: 'rgba(2, 3, 6, 0.92)',
        rimColor: 'rgba(255, 255, 255, 0.085)',
      },
      {
        baseXRatio: 0.16,
        baseYRatio: 0.22,
        x: width * 0.16,
        y: height * 0.22,
        baseRadius: 280,
        harmonics: [
          { freq: 2, amp: 24, speed: -0.36, phase: 0.8 },
          { freq: 4, amp: 16, speed: 0.45, phase: 2.1 },
        ],
        rotation: 1.2,
        rotationSpeed: -0.00028,
        stretch: 1,
        targetStretch: 1,
        stretchAngle: 0,
        targetStretchAngle: 0,
        colorCenter: 'rgba(15, 22, 34, 0.42)',
        colorMid: 'rgba(6, 9, 15, 0.68)',
        colorOuter: 'rgba(1, 2, 4, 0.90)',
        rimColor: 'rgba(16, 185, 129, 0.075)',
      },
      {
        baseXRatio: 0.84,
        baseYRatio: 0.25,
        x: width * 0.84,
        y: height * 0.25,
        baseRadius: 290,
        harmonics: [
          { freq: 3, amp: 25, speed: 0.38, phase: 1.5 },
          { freq: 5, amp: 14, speed: -0.42, phase: 3.2 },
        ],
        rotation: 2.4,
        rotationSpeed: 0.00030,
        stretch: 1,
        targetStretch: 1,
        stretchAngle: 0,
        targetStretchAngle: 0,
        colorCenter: 'rgba(20, 28, 42, 0.45)',
        colorMid: 'rgba(8, 12, 20, 0.70)',
        colorOuter: 'rgba(2, 3, 7, 0.92)',
        rimColor: 'rgba(56, 189, 248, 0.075)',
      },

      // Middle row (covers Customer Portal, Catalog, Admin tables)
      {
        baseXRatio: 0.50,
        baseYRatio: 0.50,
        x: width * 0.50,
        y: height * 0.50,
        baseRadius: 360,
        harmonics: [
          { freq: 2, amp: 30, speed: 0.35, phase: 0.5 },
          { freq: 3, amp: 22, speed: -0.40, phase: 1.8 },
          { freq: 4, amp: 14, speed: 0.50, phase: 3.2 },
        ],
        rotation: 0.6,
        rotationSpeed: -0.00025,
        stretch: 1,
        targetStretch: 1,
        stretchAngle: 0,
        targetStretchAngle: 0,
        colorCenter: 'rgba(19, 26, 40, 0.50)',
        colorMid: 'rgba(8, 12, 19, 0.72)',
        colorOuter: 'rgba(2, 3, 6, 0.94)',
        rimColor: 'rgba(255, 255, 255, 0.09)',
      },
      {
        baseXRatio: 0.12,
        baseYRatio: 0.56,
        x: width * 0.12,
        y: height * 0.56,
        baseRadius: 310,
        harmonics: [
          { freq: 3, amp: 24, speed: 0.44, phase: 2.3 },
          { freq: 5, amp: 15, speed: -0.35, phase: 0.9 },
        ],
        rotation: 1.8,
        rotationSpeed: 0.00027,
        stretch: 1,
        targetStretch: 1,
        stretchAngle: 0,
        targetStretchAngle: 0,
        colorCenter: 'rgba(16, 23, 36, 0.44)',
        colorMid: 'rgba(7, 10, 16, 0.69)',
        colorOuter: 'rgba(1, 2, 4, 0.90)',
        rimColor: 'rgba(52, 211, 153, 0.075)',
      },
      {
        baseXRatio: 0.88,
        baseYRatio: 0.58,
        x: width * 0.88,
        y: height * 0.58,
        baseRadius: 320,
        harmonics: [
          { freq: 2, amp: 28, speed: -0.38, phase: 1.1 },
          { freq: 4, amp: 16, speed: 0.48, phase: 2.7 },
        ],
        rotation: 3.2,
        rotationSpeed: -0.00031,
        stretch: 1,
        targetStretch: 1,
        stretchAngle: 0,
        targetStretchAngle: 0,
        colorCenter: 'rgba(18, 25, 38, 0.45)',
        colorMid: 'rgba(7, 11, 18, 0.70)',
        colorOuter: 'rgba(2, 3, 6, 0.92)',
        rimColor: 'rgba(56, 189, 248, 0.08)',
      },

      // Bottom row (covers lower product rows, checkout, footer, bottom logs)
      {
        baseXRatio: 0.25,
        baseYRatio: 0.86,
        x: width * 0.25,
        y: height * 0.86,
        baseRadius: 350,
        harmonics: [
          { freq: 2, amp: 32, speed: -0.34, phase: 2.5 },
          { freq: 3, amp: 20, speed: 0.46, phase: 0.9 },
        ],
        rotation: 1.0,
        rotationSpeed: 0.00029,
        stretch: 1,
        targetStretch: 1,
        stretchAngle: 0,
        targetStretchAngle: 0,
        colorCenter: 'rgba(17, 24, 38, 0.46)',
        colorMid: 'rgba(8, 11, 18, 0.72)',
        colorOuter: 'rgba(2, 2, 5, 0.94)',
        rimColor: 'rgba(255, 255, 255, 0.085)',
      },
      {
        baseXRatio: 0.76,
        baseYRatio: 0.85,
        x: width * 0.76,
        y: height * 0.85,
        baseRadius: 360,
        harmonics: [
          { freq: 3, amp: 30, speed: 0.40, phase: 1.7 },
          { freq: 4, amp: 18, speed: -0.45, phase: 3.6 },
        ],
        rotation: 2.1,
        rotationSpeed: -0.00033,
        stretch: 1,
        targetStretch: 1,
        stretchAngle: 0,
        targetStretchAngle: 0,
        colorCenter: 'rgba(16, 23, 36, 0.45)',
        colorMid: 'rgba(7, 10, 17, 0.70)',
        colorOuter: 'rgba(1, 2, 4, 0.91)',
        rimColor: 'rgba(16, 185, 129, 0.08)',
      },
    ];

    // 3D Point Projection Helper
    const project3D = (
      x: number,
      y: number,
      z: number,
      rotX: number,
      rotY: number,
      rotZ: number,
      centerX: number,
      centerY: number
    ) => {
      const cosZ = Math.cos(rotZ);
      const sinZ = Math.sin(rotZ);
      const x1 = x * cosZ - y * sinZ;
      const y1 = x * sinZ + y * cosZ;
      const z1 = z;

      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const y2 = y1 * cosX - z1 * sinX;
      const z2 = y1 * sinX + z1 * cosX;
      const x2 = x1;

      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const x3 = x2 * cosY + z2 * sinY;
      const z3 = -x2 * sinY + z2 * cosY;
      const y3 = y2;

      const cameraDistance = 950;
      const scale = cameraDistance / (cameraDistance + z3);
      return {
        x: centerX + x3 * scale,
        y: centerY + y3 * scale,
        z: z3,
        scale,
      };
    };

    let lastTime = performance.now();

    // Main 60fps Animation Loop
    const render = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.05);
      lastTime = currentTime;
      const timeSec = currentTime * 0.001;

      // Smooth cursor coordinate interpolation strictly for ripple origin / cursor aura
      const lerpFactor = 0.12;
      mouseX += (targetMouseX - mouseX) * lerpFactor;
      mouseY += (targetMouseY - mouseY) * lerpFactor;

      // Decay scroll velocity smoothly
      scrollVelocity *= 0.92;

      // 1. Clear canvas with Deep Black Liquid Crystal base
      ctx.fillStyle = '#030305';
      ctx.fillRect(0, 0, width, height);

      // Deep obsidian ambient gradients centered symmetrically in viewport
      const baseGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        100,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.85
      );
      baseGrad.addColorStop(0, '#0a0e16');
      baseGrad.addColorStop(0.35, '#05070c');
      baseGrad.addColorStop(0.75, '#020305');
      baseGrad.addColorStop(1, '#000000');
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Render 8 Morphing Organic Black Liquid Crystal Blobs across full screen
      liquidBlobs.forEach((blob) => {
        // Blobs stay anchored to their designated screen sections
        const targetX = blob.baseXRatio * width;
        const targetY = blob.baseYRatio * height;
        blob.x += (targetX - blob.x) * 0.04;
        blob.y += (targetY - blob.y) * 0.04;

        if (!prefersReducedMotion) {
          blob.rotation += blob.rotationSpeed * (1 + scrollVelocity * 0.2);
        }

        // Ripple interaction: expanding ripple wave subtly distorts nearby blob stretch as it passes
        let rippleDistort = 0;
        if (!prefersReducedMotion && ripples.length > 0) {
          for (let r = 0; r < ripples.length; r++) {
            const rip = ripples[r];
            const d = Math.hypot(rip.x - blob.x, rip.y - blob.y);
            const waveDelta = Math.abs(d - rip.radius);
            if (waveDelta < 35) {
              rippleDistort = Math.max(rippleDistort, (1 - waveDelta / 35) * rip.opacity * 0.12);
            }
          }
        }

        blob.targetStretch = 1 + rippleDistort;
        blob.stretch += (blob.targetStretch - blob.stretch) * 0.05;

        // Spline points computation
        const pointsCount = 44;
        const points: Array<{ x: number; y: number }> = [];

        for (let i = 0; i < pointsCount; i++) {
          const angle = (i / pointsCount) * Math.PI * 2;
          let r = blob.baseRadius;

          if (!prefersReducedMotion) {
            blob.harmonics.forEach((h) => {
              r += Math.sin(angle * h.freq + timeSec * h.speed + h.phase) * h.amp;
            });
          }

          const cosAngleDiff = Math.cos(angle - blob.stretchAngle);
          const stretchFactor = 1 + (blob.stretch - 1) * Math.max(0, cosAngleDiff);
          r *= stretchFactor;

          const px = blob.x + Math.cos(angle + blob.rotation) * r;
          const py = blob.y + Math.sin(angle + blob.rotation) * r;
          points.push({ x: px, y: py });
        }

        // Quadratic bezier curved path
        ctx.beginPath();
        const startX = (points[0].x + points[pointsCount - 1].x) * 0.5;
        const startY = (points[0].y + points[pointsCount - 1].y) * 0.5;
        ctx.moveTo(startX, startY);

        for (let i = 0; i < pointsCount; i++) {
          const next = points[(i + 1) % pointsCount];
          const midX = (points[i].x + next.x) * 0.5;
          const midY = (points[i].y + next.y) * 0.5;
          ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
        }
        ctx.closePath();

        const blobGrad = ctx.createRadialGradient(
          blob.x + Math.cos(blob.stretchAngle) * 35,
          blob.y + Math.sin(blob.stretchAngle) * 35,
          blob.baseRadius * 0.15,
          blob.x,
          blob.y,
          blob.baseRadius * 1.3
        );
        blobGrad.addColorStop(0, blob.colorCenter);
        blobGrad.addColorStop(0.55, blob.colorMid);
        blobGrad.addColorStop(0.88, blob.colorOuter);
        blobGrad.addColorStop(1, 'transparent');

        ctx.fillStyle = blobGrad;
        ctx.fill();

        // Crystal caustic rim
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = blob.rimColor;
        ctx.stroke();

        // Internal specular caustic sheen
        if (!prefersReducedMotion) {
          ctx.save();
          ctx.clip();
          const sheenX = blob.x + Math.sin(timeSec * 0.6 + blob.rotation) * (blob.baseRadius * 0.45);
          const sheenY = blob.y + Math.cos(timeSec * 0.5 + blob.rotation) * (blob.baseRadius * 0.35);
          const sheenGrad = ctx.createRadialGradient(
            sheenX,
            sheenY,
            5,
            sheenX,
            sheenY,
            blob.baseRadius * 0.7
          );
          sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0.07)');
          sheenGrad.addColorStop(0.4, 'rgba(16, 185, 129, 0.04)');
          sheenGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = sheenGrad;
          ctx.beginPath();
          ctx.arc(sheenX, sheenY, blob.baseRadius * 0.7, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });

      // 3. Subtle Moving Diagonal Crystal Reflection across Glass Environment
      const sheenAngle = Math.PI * 0.22;
      const sheenOffset = ((timeSec * 35) % (width + 600)) - 300;
      const sheenGrad = ctx.createLinearGradient(
        sheenOffset,
        0,
        sheenOffset + 260,
        height
      );
      sheenGrad.addColorStop(0, 'transparent');
      sheenGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0.015)');
      sheenGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.038)');
      sheenGrad.addColorStop(0.55, 'rgba(16, 185, 129, 0.02)');
      sheenGrad.addColorStop(1, 'transparent');

      ctx.save();
      ctx.translate(width * 0.5, height * 0.5);
      ctx.rotate(sheenAngle - Math.PI * 0.22);
      ctx.translate(-width * 0.5, -height * 0.5);
      ctx.fillStyle = sheenGrad;
      ctx.fillRect(-200, -200, width + 400, height + 400);
      ctx.restore();

      // 4. Update & Draw Liquid Glass Distortion Ripples originating from cursor
      for (let rIdx = ripples.length - 1; rIdx >= 0; rIdx--) {
        const ripple = ripples[rIdx];
        ripple.radius += ripple.speed;
        ripple.speed *= 0.984; // Smooth natural fluid deceleration as wave spreads

        const progress = ripple.radius / ripple.maxRadius;
        // Smooth natural wave dissipation
        ripple.opacity = ripple.maxOpacity * Math.max(0, 1 - progress);

        if (ripple.opacity < 0.008 || ripple.radius >= ripple.maxRadius) {
          ripples.splice(rIdx, 1);
          continue;
        }

        ctx.save();

        // A. Subtle refractive background caustic wave fill
        if (ripple.radius > 12) {
          const causticGrad = ctx.createRadialGradient(
            ripple.x,
            ripple.y,
            Math.max(0, ripple.radius - 20),
            ripple.x,
            ripple.y,
            ripple.radius + 6
          );
          causticGrad.addColorStop(0, 'transparent');
          causticGrad.addColorStop(0.5, `rgba(16, 185, 129, ${(ripple.opacity * 0.10).toFixed(3)})`);
          causticGrad.addColorStop(0.85, `rgba(56, 189, 248, ${(ripple.opacity * 0.07).toFixed(3)})`);
          causticGrad.addColorStop(1, 'transparent');

          ctx.fillStyle = causticGrad;
          ctx.beginPath();
          ctx.arc(ripple.x, ripple.y, ripple.radius + 6, 0, Math.PI * 2);
          ctx.fill();
        }

        // B. Primary expanding wave crest (smooth, circular, natural)
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);

        // Emerald outer wave glow
        ctx.lineWidth = ripple.thickness * 1.5;
        ctx.strokeStyle = `rgba(16, 185, 129, ${(ripple.opacity * 0.36).toFixed(3)})`;
        ctx.stroke();

        // White crystalline crest
        ctx.lineWidth = ripple.thickness;
        ctx.strokeStyle = `rgba(255, 255, 255, ${(ripple.opacity * 0.48).toFixed(3)})`;
        ctx.stroke();

        // C. Secondary subtle inner echo wave (concentric ripple)
        if (ripple.radius > 26) {
          ctx.beginPath();
          ctx.arc(ripple.x, ripple.y, ripple.radius * 0.72, 0, Math.PI * 2);
          ctx.lineWidth = ripple.thickness * 0.8;
          ctx.strokeStyle = `rgba(56, 189, 248, ${(ripple.opacity * 0.22).toFixed(3)})`;
          ctx.stroke();
        }

        ctx.restore();
      }

      // Subtle active cursor ripple aura (beacon where ripples originate)
      if (isPointerActive && !prefersReducedMotion) {
        ctx.save();
        const cursorRadius = 22;
        const cursorGlow = ctx.createRadialGradient(
          mouseX,
          mouseY,
          0,
          mouseX,
          mouseY,
          cursorRadius
        );
        cursorGlow.addColorStop(0, 'rgba(255, 255, 255, 0.20)');
        cursorGlow.addColorStop(0.4, 'rgba(56, 189, 248, 0.10)');
        cursorGlow.addColorStop(0.75, 'rgba(16, 185, 129, 0.05)');
        cursorGlow.addColorStop(1, 'transparent');

        ctx.fillStyle = cursorGlow;
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, cursorRadius, 0, Math.PI * 2);
        ctx.fill();

        // Delicate crystal micro spark at cursor
        ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 5. Secondary Quantum Satellites (Permanent upper & lower quadrant luminous activity)
      satellites.forEach((sat) => {
        const targetSatX = sat.baseXRatio * width;
        const targetSatY = sat.baseYRatio * height;
        sat.x += (targetSatX - sat.x) * 0.05;
        sat.y += (targetSatY - sat.y) * 0.05;

        // Satellite Halo
        const satHalo = ctx.createRadialGradient(sat.x, sat.y, 2, sat.x, sat.y, 55);
        satHalo.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
        satHalo.addColorStop(0.5, 'rgba(56, 189, 248, 0.08)');
        satHalo.addColorStop(1, 'transparent');
        ctx.fillStyle = satHalo;
        ctx.beginPath();
        ctx.arc(sat.x, sat.y, 55, 0, Math.PI * 2);
        ctx.fill();

        // Satellite Core Node
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sat.x, sat.y, sat.radius * 0.35, 0, Math.PI * 2);
        ctx.fill();

        // Micro-orbiting satellite particles
        sat.particles.forEach((sp) => {
          sp.angle += sp.speed * dt;
          const px = sat.x + Math.cos(sp.angle) * sp.dist;
          const py = sat.y + Math.sin(sp.angle) * (sp.dist * 0.6);

          ctx.fillStyle = sp.color;
          ctx.beginPath();
          ctx.arc(px, py, sp.size, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.beginPath();
          ctx.arc(px, py, sp.size * 0.45, 0, Math.PI * 2);
          ctx.fill();
        });
      });

      // 6. Central Nucleus: Completely FIXED in original position (exact center of viewport)
      // The nucleus NEVER moves, follows, chases, or shifts toward the mouse cursor.
      const nucleusX = width * 0.5;
      const nucleusY = height * 0.5;

      // Draw Central Nucleus (Atomic Quantum Core) - completely stationary
      // Preserves existing design, size, glow, color, and centered position exactly
      const pulse = prefersReducedMotion ? 0 : Math.sin(timeSec * 2.4) * 2.5;
      const nucleusRadius = 22 + pulse;

      // Outer Corona (stationary glow)
      const coronaRadius = 150;
      const coronaGrad = ctx.createRadialGradient(
        nucleusX,
        nucleusY,
        nucleusRadius * 0.5,
        nucleusX,
        nucleusY,
        coronaRadius
      );
      coronaGrad.addColorStop(0, 'rgba(16, 185, 129, 0.20)');
      coronaGrad.addColorStop(0.35, 'rgba(56, 189, 248, 0.10)');
      coronaGrad.addColorStop(0.7, 'rgba(203, 213, 225, 0.05)');
      coronaGrad.addColorStop(1, 'transparent');

      ctx.fillStyle = coronaGrad;
      ctx.beginPath();
      ctx.arc(nucleusX, nucleusY, coronaRadius, 0, Math.PI * 2);
      ctx.fill();

      // Mid Halo (stationary halo)
      const haloGrad = ctx.createRadialGradient(
        nucleusX,
        nucleusY,
        0,
        nucleusX,
        nucleusY,
        nucleusRadius * 2.2
      );
      haloGrad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
      haloGrad.addColorStop(0.25, 'rgba(110, 231, 183, 0.78)');
      haloGrad.addColorStop(0.65, 'rgba(16, 185, 129, 0.38)');
      haloGrad.addColorStop(1, 'transparent');

      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(nucleusX, nucleusY, nucleusRadius * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Inner Core Spherical Node
      const coreGrad = ctx.createRadialGradient(
        nucleusX - nucleusRadius * 0.25,
        nucleusY - nucleusRadius * 0.25,
        nucleusRadius * 0.1,
        nucleusX,
        nucleusY,
        nucleusRadius
      );
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.4, '#a7f3d0');
      coreGrad.addColorStop(0.85, '#059669');
      coreGrad.addColorStop(1, '#064e3b');

      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(nucleusX, nucleusY, nucleusRadius, 0, Math.PI * 2);
      ctx.fill();

      // Micro tumbling subatomic core nodes
      if (!prefersReducedMotion) {
        for (let j = 0; j < 3; j++) {
          const subAngle = timeSec * 1.8 + (j * Math.PI * 2) / 3;
          const subDist = nucleusRadius * 0.45;
          const subX = nucleusX + Math.cos(subAngle) * subDist;
          const subY = nucleusY + Math.sin(subAngle) * subDist * 0.7;

          ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
          ctx.beginPath();
          ctx.arc(subX, subY, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 7. Draw 6 Expansive 3D Elliptical Orbital Paths
      // Anchored symmetrically around the fixed central nucleus
      const computedOrbits = orbits.map((o) => {
        const radX = Math.max(o.baseRadiusX, width * o.radiusXFactor);
        const radY = Math.max(o.baseRadiusY, height * o.radiusYFactor);
        return {
          ...o,
          radX,
          radY,
        };
      });

      computedOrbits.forEach((orbit) => {
        const segments = 80;
        ctx.beginPath();

        const combinedRotX = orbit.inclinationX;
        const combinedRotY = 0;
        const combinedRotZ = orbit.inclinationZ;

        let firstPoint = true;

        for (let s = 0; s <= segments; s++) {
          const phi = (s / segments) * Math.PI * 2;
          const lx = Math.cos(phi) * orbit.radX;
          const ly = Math.sin(phi) * orbit.radY;
          const lz = 0;

          const proj = project3D(
            lx,
            ly,
            lz,
            combinedRotX,
            combinedRotY,
            combinedRotZ,
            nucleusX,
            nucleusY
          );

          if (firstPoint) {
            ctx.moveTo(proj.x, proj.y);
            firstPoint = false;
          } else {
            ctx.lineTo(proj.x, proj.y);
          }
        }

        ctx.closePath();
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = orbit.color;
        ctx.stroke();
      });

      // 8. Update & Draw Orbiting Particles (with 3D depth, light trails, and subtle wave interaction)
      const renderedParticles = particles.map((p) => {
        p.angle += p.speed * dt;

        const orbit = computedOrbits[p.orbitIndex];
        const combinedRotX = orbit.inclinationX;
        const combinedRotY = 0;
        const combinedRotZ = orbit.inclinationZ;

        const wobble = prefersReducedMotion ? 0 : Math.sin(timeSec * p.wobbleSpeed + p.wobbleOffset) * 4;
        const lx = Math.cos(p.angle) * (orbit.radX + wobble);
        const ly = Math.sin(p.angle) * (orbit.radY + wobble);
        const lz = 0;

        let proj = project3D(
          lx,
          ly,
          lz,
          combinedRotX,
          combinedRotY,
          combinedRotZ,
          nucleusX,
          nucleusY
        );

        // Ripple interaction: wave subtly nudges particles as the wave passes over them
        if (!prefersReducedMotion && ripples.length > 0) {
          for (let r = 0; r < ripples.length; r++) {
            const rip = ripples[r];
            const dx = proj.x - rip.x;
            const dy = proj.y - rip.y;
            const dist = Math.hypot(dx, dy);
            const distDiff = Math.abs(dist - rip.radius);
            if (distDiff < 22 && dist > 1) {
              const push = (1 - distDiff / 22) * rip.opacity * 3.5;
              proj.x += (dx / dist) * push;
              proj.y += (dy / dist) * push;
              break;
            }
          }
        }

        p.history.unshift({ x: proj.x, y: proj.y, alpha: 1 });
        if (p.history.length > 7) {
          p.history.pop();
        }

        return {
          particle: p,
          proj,
          z: proj.z,
        };
      });

      // Sort by Z coordinate (back-to-front depth rendering)
      renderedParticles.sort((a, b) => a.z - b.z);

      renderedParticles.forEach(({ particle: p, proj }) => {
        const depthNorm = Math.max(0.35, Math.min(1.25, proj.scale));
        const effectiveSize = Math.max(1, p.size * depthNorm);
        const depthAlpha = proj.z > 0 ? 0.88 : 0.45;
        const finalAlpha = depthAlpha;

        // A. Light trail
        if (p.history.length > 1 && !prefersReducedMotion) {
          ctx.beginPath();
          ctx.moveTo(p.history[0].x, p.history[0].y);

          for (let h = 1; h < p.history.length; h++) {
            ctx.lineTo(p.history[h].x, p.history[h].y);
          }

          ctx.lineWidth = effectiveSize * 0.6;
          ctx.strokeStyle = p.glowColor.replace(
            /[\d.]+\)$/,
            `${(0.24 * finalAlpha).toFixed(3)})`
          );
          ctx.stroke();
        }

        // B. Particle soft glow aura
        const glowRadius = effectiveSize * 3.5;
        const pGlow = ctx.createRadialGradient(
          proj.x,
          proj.y,
          0,
          proj.x,
          proj.y,
          glowRadius
        );
        pGlow.addColorStop(0, p.glowColor.replace(/[\d.]+\)$/, `${(0.65 * finalAlpha).toFixed(3)})`));
        pGlow.addColorStop(0.5, p.glowColor.replace(/[\d.]+\)$/, `${(0.22 * finalAlpha).toFixed(3)})`));
        pGlow.addColorStop(1, 'transparent');

        ctx.fillStyle = pGlow;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // C. Particle solid core
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, effectiveSize, 0, Math.PI * 2);
        ctx.fill();

        // D. Specular light center
        ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * finalAlpha})`;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, effectiveSize * 0.45, 0, Math.PI * 2);
        ctx.fill();
      });

      // 9. Update and Draw Ambient Quantum Dust / Sparkles across entire screen
      ambientNodes.forEach((node) => {
        if (!prefersReducedMotion) {
          node.x += node.vx;
          node.y += node.vy;

          if (node.x < 0) node.x = width;
          if (node.x > width) node.x = 0;
          if (node.y < 0) node.y = height;
          if (node.y > height) node.y = 0;
        }

        const alpha =
          node.baseAlpha + (prefersReducedMotion ? 0 : Math.sin(timeSec * 2 + node.pulsePhase) * 0.12);

        ctx.fillStyle = node.color;
        ctx.globalAlpha = Math.max(0.08, Math.min(0.65, alpha));
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      motionQuery.removeEventListener('change', handleMotionChange);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
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
      {/* 1. Underlying Atmospheric Ambient Mesh Glow spanning full height */}
      <div
        className="absolute inset-0 w-full h-full pointer-events-none opacity-85"
        style={{
          background:
            'radial-gradient(1400px circle at 50% 50%, rgba(16, 185, 129, 0.06), rgba(56, 189, 248, 0.035) 45%, transparent 75%)',
        }}
      />

      {/* 2. Interactive Black Liquid Crystal & 3D Orbital Particle System Canvas */}
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

      {/* 3. Subtle Crystal Specular Lattice Grid Overlay across entire viewport */}
      <div
        className="absolute inset-0 w-full h-full opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255, 255, 255, 0.45) 1px, transparent 1px), radial-gradient(rgba(255, 255, 255, 0.45) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          backgroundPosition: '0 0, 24px 24px',
        }}
      />
    </div>
  );
};
