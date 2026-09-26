import React, { useEffect, useRef } from 'react';

/**
 * CursorReactiveBackground
 *
 * BLACK LIQUID CRYSTAL-CLEAR GLASS ANIMATION THEME
 *
 * 1. Deep black glossy liquid-glass environment (#000000, #030305, #08080c)
 * 2. Continuously morphing, flowing, stretching, and rotating black liquid crystal surfaces
 * 3. Subtle moving crystal specular reflections and caustics across liquid surfaces
 * 4. High-tech cursor liquid distortion ripples that dissipate naturally
 * 5. Full cursor-reactive liquid tension coupling and 3D parallax
 * 6. Preserved atomic orbital particle system:
 *    - Central nucleus with multi-layered quantum halo and breathing pulse
 *    - 6 elliptical 3D orbits with inclination & tilt driven by cursor pitch/roll
 *    - Orbiting particles with depth-sorting, light trails, and proximity deflection
 *    - Restrained luxury palette: soft white, silver, subtle emerald, subtle cyan
 * 7. High-DPI 60fps Canvas rendering, zero React re-renders, accessible fallback
 */

interface OrbitDefinition {
  radiusX: number;
  radiusY: number;
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
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isTouch = window.matchMedia('(pointer: coarse)').matches;

    // Mouse tracking state (with smooth viscous lerp damping)
    let mouseX = width * 0.5;
    let mouseY = height * 0.38;
    let targetMouseX = width * 0.5;
    let targetMouseY = height * 0.38;

    let prevMouseX = width * 0.5;
    let prevMouseY = height * 0.38;

    let normX = 0;
    let normY = 0;
    let targetNormX = 0;
    let targetNormY = 0;

    // High-tech liquid ripples pool
    const ripples: LiquidRipple[] = [];
    let lastRippleX = width * 0.5;
    let lastRippleY = height * 0.38;

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      targetNormX = (e.clientX - w / 2) / (w / 2);
      targetNormY = (e.clientY - h / 2) / (h / 2);

      // Create subtle high-tech liquid crystal distortion ripples on movement
      const distFromLastRipple = Math.hypot(e.clientX - lastRippleX, e.clientY - lastRippleY);
      if (distFromLastRipple > 36 && !prefersReducedMotion) {
        lastRippleX = e.clientX;
        lastRippleY = e.clientY;
        const velocity = Math.min(distFromLastRipple * 0.15, 6);
        ripples.push({
          x: e.clientX,
          y: e.clientY,
          radius: 8,
          maxRadius: Math.min(180 + velocity * 25, 260),
          speed: 1.8 + velocity * 0.3,
          opacity: Math.min(0.28 + velocity * 0.05, 0.45),
          maxOpacity: Math.min(0.28 + velocity * 0.05, 0.45),
          thickness: 1.2 + Math.random() * 0.8,
        });

        // Cap active ripples for optimal performance
        if (ripples.length > 18) {
          ripples.shift();
        }
      }
    };

    if (!isTouch) {
      window.addEventListener('mousemove', handleMouseMove, { passive: true });
    }

    // 1. Definition of 6 distinct 3D orbital planes (Atomic Gyroscope)
    // Refined for dark crystal environment with restrained luminous accents
    const orbits: OrbitDefinition[] = [
      {
        radiusX: 135,
        radiusY: 58,
        inclinationX: 0.42,
        inclinationZ: 0.28,
        color: 'rgba(16, 185, 129, 0.20)',
        glowColor: 'rgba(16, 185, 129, 0.42)',
      },
      {
        radiusX: 225,
        radiusY: 90,
        inclinationX: -0.58,
        inclinationZ: -0.52,
        color: 'rgba(56, 189, 248, 0.18)',
        glowColor: 'rgba(56, 189, 248, 0.38)',
      },
      {
        radiusX: 315,
        radiusY: 120,
        inclinationX: 0.95,
        inclinationZ: 0.85,
        color: 'rgba(255, 255, 255, 0.16)',
        glowColor: 'rgba(203, 213, 225, 0.35)',
      },
      {
        radiusX: 420,
        radiusY: 158,
        inclinationX: -0.82,
        inclinationZ: 1.15,
        color: 'rgba(52, 211, 153, 0.18)',
        glowColor: 'rgba(52, 211, 153, 0.36)',
      },
      {
        radiusX: 535,
        radiusY: 190,
        inclinationX: 0.48,
        inclinationZ: -1.25,
        color: 'rgba(241, 245, 249, 0.14)',
        glowColor: 'rgba(255, 255, 255, 0.32)',
      },
      {
        radiusX: 650,
        radiusY: 228,
        inclinationX: -0.32,
        inclinationZ: 1.95,
        color: 'rgba(45, 212, 191, 0.15)',
        glowColor: 'rgba(45, 212, 191, 0.32)',
      },
    ];

    // Restrained, elegant luminous accents (Soft white, silver, subtle green, subtle cyan)
    const particleColors = [
      { fill: '#ffffff', glow: 'rgba(255, 255, 255, 0.85)' }, // Pure Crystal White
      { fill: '#cbd5e1', glow: 'rgba(203, 213, 225, 0.80)' }, // Polished Silver
      { fill: '#10b981', glow: 'rgba(16, 185, 129, 0.80)' },  // Restrained Emerald
      { fill: '#34d399', glow: 'rgba(52, 211, 153, 0.82)' },  // Mint Crystal
      { fill: '#38bdf8', glow: 'rgba(56, 189, 248, 0.78)' },  // Subtle Cyan Sky
      { fill: '#e2e8f0', glow: 'rgba(226, 232, 240, 0.82)' }, // Starlight
    ];

    // 2. Initialize orbiting particles distributed across all orbital paths
    const particles: Particle[] = [];
    const particleCount = isTouch ? 24 : 46;

    for (let i = 0; i < particleCount; i++) {
      const orbitIndex = i % orbits.length;
      const col = particleColors[i % particleColors.length];
      const baseAngle = (i / particleCount) * Math.PI * 2 + Math.random() * 0.4;
      const direction = i % 2 === 0 ? 1 : -1;
      const speed = (0.28 + Math.random() * 0.42) * direction * (prefersReducedMotion ? 0.2 : 1);
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

    // 3. Initialize ambient floating quantum dust / crystal sparkles
    const ambientNodes: AmbientNode[] = [];
    const ambientCount = isTouch ? 12 : 24;

    for (let i = 0; i < ambientCount; i++) {
      const col = particleColors[i % particleColors.length];
      ambientNodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: 1.2 + Math.random() * 1.8,
        color: col.fill,
        baseAlpha: 0.16 + Math.random() * 0.22,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    // 4. Definition of 5 Organic Black Liquid Crystal Glass Blobs
    // These continuously morph, stretch, and flow behind the UI
    const liquidBlobs: LiquidBlob[] = [
      {
        baseXRatio: 0.5,
        baseYRatio: 0.38,
        x: width * 0.5,
        y: height * 0.38,
        baseRadius: 320,
        harmonics: [
          { freq: 2, amp: 26, speed: 0.42, phase: 0 },
          { freq: 3, amp: 20, speed: -0.32, phase: 1.2 },
          { freq: 5, amp: 14, speed: 0.55, phase: 2.8 },
        ],
        rotation: 0,
        rotationSpeed: 0.00035,
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
        baseXRatio: 0.18,
        baseYRatio: 0.65,
        x: width * 0.18,
        y: height * 0.65,
        baseRadius: 260,
        harmonics: [
          { freq: 2, amp: 24, speed: -0.36, phase: 0.8 },
          { freq: 4, amp: 16, speed: 0.45, phase: 2.1 },
          { freq: 6, amp: 10, speed: -0.6, phase: 3.4 },
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
        baseXRatio: 0.82,
        baseYRatio: 0.32,
        x: width * 0.82,
        y: height * 0.32,
        baseRadius: 290,
        harmonics: [
          { freq: 3, amp: 28, speed: 0.38, phase: 1.5 },
          { freq: 4, amp: 18, speed: -0.42, phase: 3.2 },
          { freq: 7, amp: 12, speed: 0.58, phase: 0.4 },
        ],
        rotation: 2.4,
        rotationSpeed: 0.00031,
        stretch: 1,
        targetStretch: 1,
        stretchAngle: 0,
        targetStretchAngle: 0,
        colorCenter: 'rgba(20, 28, 42, 0.45)',
        colorMid: 'rgba(8, 12, 20, 0.70)',
        colorOuter: 'rgba(2, 3, 7, 0.92)',
        rimColor: 'rgba(56, 189, 248, 0.075)',
      },
      {
        baseXRatio: 0.65,
        baseYRatio: 0.82,
        x: width * 0.65,
        y: height * 0.82,
        baseRadius: 360,
        harmonics: [
          { freq: 2, amp: 34, speed: -0.32, phase: 2.1 },
          { freq: 3, amp: 22, speed: 0.44, phase: 0.7 },
          { freq: 5, amp: 15, speed: -0.52, phase: 4.2 },
        ],
        rotation: 0.8,
        rotationSpeed: -0.00033,
        stretch: 1,
        targetStretch: 1,
        stretchAngle: 0,
        targetStretchAngle: 0,
        colorCenter: 'rgba(16, 24, 36, 0.46)',
        colorMid: 'rgba(7, 11, 18, 0.72)',
        colorOuter: 'rgba(2, 2, 5, 0.94)',
        rimColor: 'rgba(255, 255, 255, 0.08)',
      },
      {
        baseXRatio: 0.35,
        baseYRatio: 0.15,
        x: width * 0.35,
        y: height * 0.15,
        baseRadius: 240,
        harmonics: [
          { freq: 3, amp: 22, speed: 0.48, phase: 3.1 },
          { freq: 5, amp: 14, speed: -0.38, phase: 1.6 },
        ],
        rotation: 3.1,
        rotationSpeed: 0.00025,
        stretch: 1,
        targetStretch: 1,
        stretchAngle: 0,
        targetStretchAngle: 0,
        colorCenter: 'rgba(14, 20, 32, 0.40)',
        colorMid: 'rgba(5, 8, 14, 0.65)',
        colorOuter: 'rgba(1, 2, 4, 0.88)',
        rimColor: 'rgba(52, 211, 153, 0.065)',
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
      // Rotation Z
      const cosZ = Math.cos(rotZ);
      const sinZ = Math.sin(rotZ);
      const x1 = x * cosZ - y * sinZ;
      const y1 = x * sinZ + y * cosZ;
      const z1 = z;

      // Rotation X
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const y2 = y1 * cosX - z1 * sinX;
      const z2 = y1 * sinX + z1 * cosX;
      const x2 = x1;

      // Rotation Y
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const x3 = x2 * cosY + z2 * sinY;
      const z3 = -x2 * sinY + z2 * cosY;
      const y3 = y2;

      // Perspective projection
      const cameraDistance = 900;
      const scale = cameraDistance / (cameraDistance + z3);
      return {
        x: centerX + x3 * scale,
        y: centerY + y3 * scale,
        z: z3,
        scale,
      };
    };

    let lastTime = performance.now();

    // Nucleus state
    let nucleusX = width * 0.5;
    let nucleusY = height * 0.38;

    // Main 60fps Animation Loop
    const render = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.05);
      lastTime = currentTime;
      const timeSec = currentTime * 0.001;

      // 1. Smooth cursor physics damping
      const lerpFactor = 0.055;
      mouseX += (targetMouseX - mouseX) * lerpFactor;
      mouseY += (targetMouseY - mouseY) * lerpFactor;
      normX += (targetNormX - normX) * lerpFactor;
      normY += (targetNormY - normY) * lerpFactor;

      // Cursor movement speed calculation
      const cursorSpeed = Math.hypot(mouseX - prevMouseX, mouseY - prevMouseY);
      prevMouseX = mouseX;
      prevMouseY = mouseY;

      // 2. Clear canvas with Deep Black Liquid Crystal base
      ctx.fillStyle = '#030305';
      ctx.fillRect(0, 0, width, height);

      // Deep obsidian ambient gradients for cinematic dimensional depth
      const baseGrad = ctx.createRadialGradient(
        width * 0.5 + normX * 60,
        height * 0.4 + normY * 50,
        80,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.8
      );
      baseGrad.addColorStop(0, '#0a0d14');
      baseGrad.addColorStop(0.35, '#05070b');
      baseGrad.addColorStop(0.75, '#020305');
      baseGrad.addColorStop(1, '#000000');
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, width, height);

      // 3. Render Morphing Organic Black Liquid Crystal Blobs
      liquidBlobs.forEach((blob) => {
        // Base coordinate with smooth cursor tension attraction
        const targetX = blob.baseXRatio * width + (isTouch ? 0 : normX * 55);
        const targetY = blob.baseYRatio * height + (isTouch ? 0 : normY * 45);
        blob.x += (targetX - blob.x) * 0.04;
        blob.y += (targetY - blob.y) * 0.04;

        if (!prefersReducedMotion) {
          blob.rotation += blob.rotationSpeed * (1 + cursorSpeed * 0.1);
        }

        // Cursor distance and elongation tension
        const dx = mouseX - blob.x;
        const dy = mouseY - blob.y;
        const distToMouse = Math.hypot(dx, dy);

        if (!isTouch && distToMouse < 450) {
          const proximity = 1 - distToMouse / 450;
          blob.targetStretch = 1 + proximity * 0.22;
          blob.targetStretchAngle = Math.atan2(dy, dx);
        } else {
          blob.targetStretch = 1;
        }

        blob.stretch += (blob.targetStretch - blob.stretch) * 0.05;
        blob.stretchAngle += (blob.targetStretchAngle - blob.stretchAngle) * 0.05;

        // Compute organic spline points around perimeter
        const pointsCount = 48;
        const points: Array<{ x: number; y: number }> = [];

        for (let i = 0; i < pointsCount; i++) {
          const angle = (i / pointsCount) * Math.PI * 2;
          let r = blob.baseRadius;

          if (!prefersReducedMotion) {
            blob.harmonics.forEach((h) => {
              r += Math.sin(angle * h.freq + timeSec * h.speed + h.phase) * h.amp;
            });
          }

          // Apply liquid stretch toward cursor
          const cosAngleDiff = Math.cos(angle - blob.stretchAngle);
          const stretchFactor = 1 + (blob.stretch - 1) * Math.max(0, cosAngleDiff);
          r *= stretchFactor;

          const px = blob.x + Math.cos(angle + blob.rotation) * r;
          const py = blob.y + Math.sin(angle + blob.rotation) * r;
          points.push({ x: px, y: py });
        }

        // Draw the smooth organic liquid glass shape using quadratic bezier curves
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

        // Multi-stop translucent liquid crystal gradient fill
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

        // Polished crystal caustic edge highlight
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = blob.rimColor;
        ctx.stroke();

        // Moving internal specular caustic sheen line
        if (!prefersReducedMotion) {
          ctx.save();
          ctx.clip(); // Restrict specular highlight to inside this liquid blob
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

      // 4. Subtle Moving Diagonal Crystal Reflection across Glass Environment
      const sheenAngle = Math.PI * 0.22 + (isTouch ? 0 : normX * 0.08);
      const sheenOffset = ((timeSec * 35) % (width + 600)) - 300;
      const sheenGrad = ctx.createLinearGradient(
        sheenOffset,
        0,
        sheenOffset + 240,
        height
      );
      sheenGrad.addColorStop(0, 'transparent');
      sheenGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0.015)');
      sheenGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.035)');
      sheenGrad.addColorStop(0.55, 'rgba(16, 185, 129, 0.02)');
      sheenGrad.addColorStop(1, 'transparent');

      ctx.save();
      ctx.translate(width * 0.5, height * 0.5);
      ctx.rotate(sheenAngle - Math.PI * 0.22);
      ctx.translate(-width * 0.5, -height * 0.5);
      ctx.fillStyle = sheenGrad;
      ctx.fillRect(-200, -200, width + 400, height + 400);
      ctx.restore();

      // 5. Update & Draw High-Tech Liquid Glass Distortion Ripples
      for (let rIdx = ripples.length - 1; rIdx >= 0; rIdx--) {
        const ripple = ripples[rIdx];
        ripple.radius += ripple.speed;
        ripple.opacity *= 0.955;

        if (ripple.opacity < 0.01 || ripple.radius >= ripple.maxRadius) {
          ripples.splice(rIdx, 1);
          continue;
        }

        ctx.save();
        ctx.beginPath();
        // High-tech subtle distortion ring with slight harmonic wobble
        const wobblePoints = 32;
        for (let p = 0; p <= wobblePoints; p++) {
          const wAngle = (p / wobblePoints) * Math.PI * 2;
          const wobbleDist = Math.sin(wAngle * 5 + timeSec * 6) * 1.5;
          const rx = ripple.x + Math.cos(wAngle) * (ripple.radius + wobbleDist);
          const ry = ripple.y + Math.sin(wAngle) * (ripple.radius * 0.72 + wobbleDist);
          if (p === 0) ctx.moveTo(rx, ry);
          else ctx.lineTo(rx, ry);
        }
        ctx.closePath();

        // Specular translucent liquid glass distortion crest
        ctx.lineWidth = ripple.thickness;
        ctx.strokeStyle = `rgba(255, 255, 255, ${(ripple.opacity * 0.55).toFixed(3)})`;
        ctx.stroke();

        // Subtle green/cyan refractive caustic companion line
        ctx.lineWidth = ripple.thickness * 1.6;
        ctx.strokeStyle = `rgba(16, 185, 129, ${(ripple.opacity * 0.35).toFixed(3)})`;
        ctx.stroke();

        ctx.restore();
      }

      // 6. Dynamic Nucleus Position with smooth parallax toward cursor
      const baseCenterX = width * 0.5;
      const baseCenterY = height * 0.38;

      const targetNucleusX = isTouch ? baseCenterX : baseCenterX + normX * 85;
      const targetNucleusY = isTouch ? baseCenterY : baseCenterY + normY * 65;

      nucleusX += (targetNucleusX - nucleusX) * lerpFactor;
      nucleusY += (targetNucleusY - nucleusY) * lerpFactor;

      // Cursor proximity calculation
      const distToCursor = Math.hypot(mouseX - nucleusX, mouseY - nucleusY);
      const proximity = isTouch ? 0 : Math.max(0, 1 - distToCursor / 520);

      const speedMultiplier = 1 + proximity * 0.55;
      const glowBoost = 1 + proximity * 0.5;

      // 3D Tilt angles influenced by cursor pitch and roll
      const tiltX = isTouch ? 0 : -normY * 0.42;
      const tiltY = isTouch ? 0 : normX * 0.48;

      // 7. Draw Central Nucleus (Atomic Quantum Core)
      const pulse = prefersReducedMotion ? 0 : Math.sin(timeSec * 2.4) * 2.5;
      const nucleusRadius = (22 + pulse) * (1 + proximity * 0.15);

      // Outer Corona (Subtle atmospheric emerald & silver atmospheric glow)
      const coronaRadius = 145 * glowBoost;
      const coronaGrad = ctx.createRadialGradient(
        nucleusX,
        nucleusY,
        nucleusRadius * 0.5,
        nucleusX,
        nucleusY,
        coronaRadius
      );
      coronaGrad.addColorStop(0, `rgba(16, 185, 129, ${0.18 * glowBoost})`);
      coronaGrad.addColorStop(0.35, `rgba(56, 189, 248, ${0.09 * glowBoost})`);
      coronaGrad.addColorStop(0.7, `rgba(203, 213, 225, ${0.04 * glowBoost})`);
      coronaGrad.addColorStop(1, 'transparent');

      ctx.fillStyle = coronaGrad;
      ctx.beginPath();
      ctx.arc(nucleusX, nucleusY, coronaRadius, 0, Math.PI * 2);
      ctx.fill();

      // Mid Halo
      const haloGrad = ctx.createRadialGradient(
        nucleusX,
        nucleusY,
        0,
        nucleusX,
        nucleusY,
        nucleusRadius * 2.2
      );
      haloGrad.addColorStop(0, `rgba(255, 255, 255, ${0.9 * glowBoost})`);
      haloGrad.addColorStop(0.25, `rgba(110, 231, 183, ${0.75 * glowBoost})`);
      haloGrad.addColorStop(0.65, `rgba(16, 185, 129, ${0.35 * glowBoost})`);
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

          ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
          ctx.beginPath();
          ctx.arc(subX, subY, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 8. Draw 3D Elliptical Orbital Paths
      orbits.forEach((orbit) => {
        const segments = 80;
        ctx.beginPath();

        const combinedRotX = orbit.inclinationX + tiltX;
        const combinedRotY = tiltY;
        const combinedRotZ = orbit.inclinationZ;

        let firstPoint = true;

        for (let s = 0; s <= segments; s++) {
          const phi = (s / segments) * Math.PI * 2;
          const lx = Math.cos(phi) * orbit.radiusX;
          const ly = Math.sin(phi) * orbit.radiusY;
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
        ctx.strokeStyle = orbit.color.replace(
          /[\d.]+\)$/,
          `${(0.14 + proximity * 0.16).toFixed(3)})`
        );
        ctx.stroke();

        // Subtle specular highlight along closest section of the orbital ring
        if (proximity > 0.05) {
          ctx.lineWidth = 1.8;
          ctx.strokeStyle = orbit.glowColor.replace(
            /[\d.]+\)$/,
            `${(0.20 * proximity).toFixed(3)})`
          );
          ctx.stroke();
        }
      });

      // 9. Update & Draw Orbiting Particles (with 3D depth and light trails)
      const renderedParticles = particles.map((p) => {
        p.angle += p.speed * speedMultiplier * dt;

        const orbit = orbits[p.orbitIndex];
        const combinedRotX = orbit.inclinationX + tiltX;
        const combinedRotY = tiltY;
        const combinedRotZ = orbit.inclinationZ;

        const wobble = prefersReducedMotion ? 0 : Math.sin(timeSec * p.wobbleSpeed + p.wobbleOffset) * 4;
        const lx = Math.cos(p.angle) * (orbit.radiusX + wobble);
        const ly = Math.sin(p.angle) * (orbit.radiusY + wobble);
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

        // Magnetic cursor interaction
        if (!isTouch) {
          const dxCursor = proj.x - mouseX;
          const dyCursor = proj.y - mouseY;
          const distParticleToCursor = Math.hypot(dxCursor, dyCursor);

          if (distParticleToCursor < 180 && distParticleToCursor > 0.1) {
            const push = (1 - distParticleToCursor / 180) * 26;
            proj.x += (dxCursor / distParticleToCursor) * push;
            proj.y += (dyCursor / distParticleToCursor) * push;
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

      // Sort by Z coordinate (true back-to-front depth rendering)
      renderedParticles.sort((a, b) => a.z - b.z);

      renderedParticles.forEach(({ particle: p, proj }) => {
        const depthNorm = Math.max(0.35, Math.min(1.25, proj.scale));
        const effectiveSize = Math.max(1, p.size * depthNorm * (1 + proximity * 0.2));
        const depthAlpha = proj.z > 0 ? 0.88 : 0.45;
        const finalAlpha = Math.min(1, depthAlpha * glowBoost);

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

      // 10. Update and Draw Ambient Quantum Dust / Sparkles
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
        ctx.globalAlpha = Math.max(0.08, Math.min(0.65, alpha * glowBoost));
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
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 transition-opacity duration-1000"
      aria-hidden="true"
    >
      {/* 1. Underlying Atmospheric Ambient Mesh Glow (Subtle emerald/cyan luminous depth behind liquid crystal) */}
      <div
        className="absolute inset-0 opacity-80"
        style={{
          background:
            'radial-gradient(1200px circle at 50% 38%, rgba(16, 185, 129, 0.06), rgba(56, 189, 248, 0.035) 45%, transparent 75%)',
        }}
      />

      {/* 2. Interactive Black Liquid Crystal & 3D Orbital Particle System Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block w-full h-full pointer-events-none will-change-transform"
      />

      {/* 3. Subtle Crystal Specular Lattice Grid Overlay (Maintains polished crystal depth) */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
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
