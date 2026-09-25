import React, { useEffect, useRef } from 'react';

/**
 * CursorReactiveBackground
 *
 * Implements a futuristic atomic/orbital particle system:
 * 1. Central glowing nucleus / core with multi-layered quantum halo and breathing pulse
 * 2. Multiple elliptical 3D orbital paths with different inclinations and aspect ratios
 * 3. Particles continuously orbiting with varied speeds, directions, radii, and sizes
 * 4. Fading light trails for orbiting particles
 * 5. Full cursor reactivity:
 *    - Nucleus shifts with smooth parallax toward cursor
 *    - Entire 3D orbital plane tilts smoothly toward cursor (3D pitch & roll)
 *    - Particles react with subtle magnetic displacement when cursor is near
 *    - Distance effect: closer cursor increases brightness, glow, and orbital velocity
 * 6. High-DPI Canvas 60fps rendering with zero React re-renders during motion
 * 7. Graceful fallback for mobile / touch and prefers-reduced-motion
 */

interface OrbitDefinition {
  radiusX: number;
  radiusY: number;
  inclinationX: number; // Radian tilt around X
  inclinationZ: number; // Radian tilt around Z
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

    // Device Pixel Ratio scaling for crystal-clear rendering on Retina displays
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

    // Mouse tracking state (with smooth lerp damping)
    let mouseX = width * 0.5;
    let mouseY = height * 0.38;
    let targetMouseX = width * 0.5;
    let targetMouseY = height * 0.38;

    let normX = 0;
    let normY = 0;
    let targetNormX = 0;
    let targetNormY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      targetNormX = (e.clientX - w / 2) / (w / 2);
      targetNormY = (e.clientY - h / 2) / (h / 2);
    };

    if (!isTouch) {
      window.addEventListener('mousemove', handleMouseMove, { passive: true });
    }

    // 1. Definition of 6 distinct 3D orbital planes (Atomic Gyroscope)
    const orbits: OrbitDefinition[] = [
      {
        radiusX: 135,
        radiusY: 58,
        inclinationX: 0.42,
        inclinationZ: 0.28,
        color: 'rgba(16, 185, 129, 0.16)',
        glowColor: 'rgba(16, 185, 129, 0.35)',
      },
      {
        radiusX: 220,
        radiusY: 88,
        inclinationX: -0.58,
        inclinationZ: -0.52,
        color: 'rgba(56, 189, 248, 0.14)',
        glowColor: 'rgba(56, 189, 248, 0.32)',
      },
      {
        radiusX: 305,
        radiusY: 115,
        inclinationX: 0.95,
        inclinationZ: 0.85,
        color: 'rgba(16, 185, 129, 0.13)',
        glowColor: 'rgba(16, 185, 129, 0.3)',
      },
      {
        radiusX: 410,
        radiusY: 155,
        inclinationX: -0.82,
        inclinationZ: 1.15,
        color: 'rgba(52, 211, 153, 0.12)',
        glowColor: 'rgba(52, 211, 153, 0.28)',
      },
      {
        radiusX: 520,
        radiusY: 185,
        inclinationX: 0.48,
        inclinationZ: -1.25,
        color: 'rgba(245, 158, 11, 0.10)',
        glowColor: 'rgba(251, 191, 36, 0.25)',
      },
      {
        radiusX: 630,
        radiusY: 220,
        inclinationX: -0.32,
        inclinationZ: 1.95,
        color: 'rgba(45, 212, 191, 0.09)',
        glowColor: 'rgba(45, 212, 191, 0.22)',
      },
    ];

    // Particle color palettes (Harmonious with FreshCart emerald/mint/azure/gold)
    const particleColors = [
      { fill: '#10b981', glow: 'rgba(16, 185, 129, 0.75)' }, // Emerald
      { fill: '#34d399', glow: 'rgba(52, 211, 153, 0.8)' },  // Mint
      { fill: '#38bdf8', glow: 'rgba(56, 189, 248, 0.75)' }, // Sky Azure
      { fill: '#2dd4bf', glow: 'rgba(45, 212, 191, 0.75)' }, // Teal
      { fill: '#fbbf24', glow: 'rgba(251, 191, 36, 0.7)' },  // Sunlit Gold
      { fill: '#6ee7b7', glow: 'rgba(110, 231, 183, 0.85)' },// Fresh Leaf
    ];

    // 2. Initialize orbiting particles distributed across all orbital paths
    const particles: Particle[] = [];
    const particleCount = isTouch ? 22 : 42;

    for (let i = 0; i < particleCount; i++) {
      const orbitIndex = i % orbits.length;
      const col = particleColors[i % particleColors.length];
      // Random starting angle distributed around circle
      const baseAngle = (i / particleCount) * Math.PI * 2 + Math.random() * 0.5;
      // Mixed clockwise and counter-clockwise orbital directions
      const direction = i % 2 === 0 ? 1 : -1;
      const speed = (0.28 + Math.random() * 0.45) * direction * (prefersReducedMotion ? 0.2 : 1);
      const size = 1.6 + Math.random() * 2.6;

      particles.push({
        orbitIndex,
        angle: baseAngle,
        speed,
        size,
        color: col.fill,
        glowColor: col.glow,
        wobbleOffset: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.8 + Math.random() * 1.2,
        history: [],
      });
    }

    // 3. Initialize ambient floating quantum dust / micro-particles
    const ambientNodes: AmbientNode[] = [];
    const ambientCount = isTouch ? 10 : 20;

    for (let i = 0; i < ambientCount; i++) {
      const col = particleColors[i % particleColors.length];
      ambientNodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        size: 1.2 + Math.random() * 1.8,
        color: col.fill,
        baseAlpha: 0.18 + Math.random() * 0.25,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    // Physics helper: 3D point rotation and projection
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
      // 1. Rotation around Z
      let cosZ = Math.cos(rotZ);
      let sinZ = Math.sin(rotZ);
      let x1 = x * cosZ - y * sinZ;
      let y1 = x * sinZ + y * cosZ;
      let z1 = z;

      // 2. Rotation around X
      let cosX = Math.cos(rotX);
      let sinX = Math.sin(rotX);
      let y2 = y1 * cosX - z1 * sinX;
      let z2 = y1 * sinX + z1 * cosX;
      let x2 = x1;

      // 3. Rotation around Y (driven by cursor horizontal tracking)
      let cosY = Math.cos(rotY);
      let sinY = Math.sin(rotY);
      let x3 = x2 * cosY + z2 * sinY;
      let z3 = -x2 * sinY + z2 * cosY;
      let y3 = y2;

      // 4. Perspective projection
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
      const dt = Math.min((currentTime - lastTime) / 1000, 0.05); // cap at 50ms
      lastTime = currentTime;

      // 1. Smooth cursor physics damping
      const lerpFactor = 0.055;
      mouseX += (targetMouseX - mouseX) * lerpFactor;
      mouseY += (targetMouseY - mouseY) * lerpFactor;
      normX += (targetNormX - normX) * lerpFactor;
      normY += (targetNormY - normY) * lerpFactor;

      // 2. Dynamic nucleus position with smooth parallax toward cursor
      // Responsive center anchor
      const baseCenterX = width * 0.5;
      const baseCenterY = height * 0.38;

      const targetNucleusX = isTouch ? baseCenterX : baseCenterX + normX * 85;
      const targetNucleusY = isTouch ? baseCenterY : baseCenterY + normY * 65;

      nucleusX += (targetNucleusX - nucleusX) * lerpFactor;
      nucleusY += (targetNucleusY - nucleusY) * lerpFactor;

      // 3. Cursor proximity / distance calculation
      const distToCursor = Math.hypot(mouseX - nucleusX, mouseY - nucleusY);
      const proximity = isTouch ? 0 : Math.max(0, 1 - distToCursor / 520);

      // Distance boost: speeds up orbits slightly, increases nucleus glow and particle brightness
      const speedMultiplier = 1 + proximity * 0.55;
      const glowBoost = 1 + proximity * 0.5;

      // 4. 3D Tilt angles influenced by cursor pitch and roll
      const tiltX = isTouch ? 0 : -normY * 0.42;
      const tiltY = isTouch ? 0 : normX * 0.48;

      ctx.clearRect(0, 0, width, height);

      // 5. Draw Central Nucleus (Atomic Core)
      // Pulse breathing
      const timeSec = currentTime * 0.001;
      const pulse = Math.sin(timeSec * 2.4) * 2.5;
      const nucleusRadius = (22 + pulse) * (1 + proximity * 0.15);

      // Outer Corona (Subtle atmospheric glow)
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
      coronaGrad.addColorStop(0.7, `rgba(52, 211, 153, ${0.03 * glowBoost})`);
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

      // Micro tumbling subatomic core nodes (gives realistic quantum interior motion)
      for (let j = 0; j < 3; j++) {
        const subAngle = timeSec * 1.8 + (j * Math.PI * 2) / 3;
        const subDist = nucleusRadius * 0.45;
        const subX = nucleusX + Math.cos(subAngle) * subDist;
        const subY = nucleusY + Math.sin(subAngle) * subDist * 0.7;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.beginPath();
        ctx.arc(subX, subY, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 6. Draw 3D Elliptical Orbital Paths
      orbits.forEach((orbit, oIdx) => {
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
        // Brighten paths slightly when cursor is nearby
        ctx.strokeStyle = orbit.color.replace(
          /[\d.]+\)$/,
          `${(0.12 + proximity * 0.14).toFixed(3)})`
        );
        ctx.stroke();

        // Subtle glowing specular highlight along closest section of the orbital ring
        if (proximity > 0.05) {
          ctx.lineWidth = 1.8;
          ctx.strokeStyle = orbit.glowColor.replace(
            /[\d.]+\)$/,
            `${(0.18 * proximity).toFixed(3)})`
          );
          ctx.stroke();
        }
      });

      // 7. Update & Draw Orbiting Particles (with 3D depth and light trails)
      // We calculate all projected particles first to sort by Z for true 3D occlusion
      const renderedParticles = particles.map((p) => {
        // Advance angle continuously
        p.angle += p.speed * speedMultiplier * dt;

        const orbit = orbits[p.orbitIndex];
        const combinedRotX = orbit.inclinationX + tiltX;
        const combinedRotY = tiltY;
        const combinedRotZ = orbit.inclinationZ;

        // Subtle radial wobble so particles feel organic
        const wobble = Math.sin(timeSec * p.wobbleSpeed + p.wobbleOffset) * 4;
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

        // Magnetic cursor interaction:
        // When cursor is close to particle, apply gentle elastic repulsion / attraction
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

        // Record position in history for smooth light trail
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

      // Sort by Z coordinate (back to front depth rendering)
      renderedParticles.sort((a, b) => a.z - b.z);

      renderedParticles.forEach(({ particle: p, proj }) => {
        // 3D Depth modulation
        // Z > 0 is in front of nucleus (brighter, larger), Z < 0 is behind (dimmer, smaller)
        const depthNorm = Math.max(0.35, Math.min(1.25, proj.scale));
        const effectiveSize = Math.max(1, p.size * depthNorm * (1 + proximity * 0.2));
        const depthAlpha = proj.z > 0 ? 0.85 : 0.45;
        const finalAlpha = Math.min(1, depthAlpha * glowBoost);

        // A. Draw light trail
        if (p.history.length > 1) {
          ctx.beginPath();
          ctx.moveTo(p.history[0].x, p.history[0].y);

          for (let h = 1; h < p.history.length; h++) {
            ctx.lineTo(p.history[h].x, p.history[h].y);
          }

          ctx.lineWidth = effectiveSize * 0.6;
          ctx.strokeStyle = p.glowColor.replace(
            /[\d.]+\)$/,
            `${(0.22 * finalAlpha).toFixed(3)})`
          );
          ctx.stroke();
        }

        // B. Draw particle soft glow aura
        const glowRadius = effectiveSize * 3.5;
        const pGlow = ctx.createRadialGradient(
          proj.x,
          proj.y,
          0,
          proj.x,
          proj.y,
          glowRadius
        );
        pGlow.addColorStop(0, p.glowColor.replace(/[\d.]+\)$/, `${(0.6 * finalAlpha).toFixed(3)})`));
        pGlow.addColorStop(0.5, p.glowColor.replace(/[\d.]+\)$/, `${(0.2 * finalAlpha).toFixed(3)})`));
        pGlow.addColorStop(1, 'transparent');

        ctx.fillStyle = pGlow;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // C. Draw particle solid core
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, effectiveSize, 0, Math.PI * 2);
        ctx.fill();

        // D. Specular light center
        ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * finalAlpha})`;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, effectiveSize * 0.45, 0, Math.PI * 2);
        ctx.fill();
      });

      // 8. Update and Draw Ambient Quantum Dust / Sparkles
      ambientNodes.forEach((node) => {
        node.x += node.vx;
        node.y += node.vy;

        // Wrap around viewport edges
        if (node.x < 0) node.x = width;
        if (node.x > width) node.x = 0;
        if (node.y < 0) node.y = height;
        if (node.y > height) node.y = 0;

        // Gentle cosmic breathing
        const alpha =
          node.baseAlpha + Math.sin(timeSec * 2 + node.pulsePhase) * 0.12;

        ctx.fillStyle = node.color;
        ctx.globalAlpha = Math.max(0.08, Math.min(0.6, alpha * glowBoost));
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
      {/* 1. Underlying Atmospheric Mesh Glow (Soft emerald/cyan ambient background lighting) */}
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(1100px circle at 50% 38%, rgba(16, 185, 129, 0.05), rgba(56, 189, 248, 0.03) 45%, transparent 75%)',
        }}
      />

      {/* 2. Interactive 3D Orbital Particle System Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block w-full h-full pointer-events-none will-change-transform"
      />

      {/* 3. Subtle Glass Specular Grid Overlay (Maintains clean glass optical depth) */}
      <div
        className="absolute inset-0 opacity-[0.018] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(rgba(11, 28, 48, 0.4) 1px, transparent 1px), radial-gradient(rgba(11, 28, 48, 0.4) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          backgroundPosition: '0 0, 24px 24px',
        }}
      />
    </div>
  );
};
