'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/* ─────────────────────────────────────────────────────────────
   Physics constants
   ──────────────────────────────────────────────────────────── */
const COLS          = 34;
const ROWS          = 30;
const SPACING       = 0.28;    // world-units between dots
const DOT_PX        = 3;       // rendered pixel size
const BASE_OPACITY  = 0.5;

// Spring-back: each frame vel gets a nudge of (orig - pos) * SPRING_K
const SPRING_K      = 0.05;
// Friction: velocity multiplied by this each frame (< 1 = damping)
const FRICTION      = 0.90;
// Repulsion: peak force added to velocity per frame at d = 0
const REPEL_FORCE   = 0.55;
// World-unit radius of the cursor's influence field (~4px on screen)
const REPEL_RADIUS  = 0.7;

// Vignette: full brightness inside FADE_START fraction of grid radius
const FADE_START    = 0.30;
// Liquid idle motion
const IDLE_DRIFT_X      = 0.035;
const IDLE_DRIFT_Y      = 0.025;
const METABALL_COUNT    = 5;
const METABALL_RADIUS   = 2.5;
const METABALL_STRENGTH = 1.2;
const METABALL_SPEED    = 0.9;
const METABALL_DECAY    = 1.2;
const METABALL_FREQ_X   = 1.3;
const METABALL_FREQ_Y   = 1.0;
// Idle threshold: stop updating when all velocities < this
const REST_EPS      = 0.0003;

/* ─────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────── */
function smoothstep(t: number) { return t * t * (3 - 2 * t); }

function radialFade(x: number, y: number, maxR: number): number {
  const n = Math.min(Math.sqrt(x * x + y * y) / maxR, 1);
  if (n <= FADE_START) return 1;
  return 1 - smoothstep((n - FADE_START) / (1 - FADE_START));
}

function makeDotTexture(): THREE.CanvasTexture {
  const size = 32;
  const cv   = document.createElement('canvas');
  cv.width   = cv.height = size;
  const ctx  = cv.getContext('2d')!;
  const half = size / 2;
  const g    = ctx.createRadialGradient(half, half, 0, half, half, half);
  g.addColorStop(0,    'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  g.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}

/* ─────────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────────── */
interface DotGridProps {
  className?: string;
  onClick?: () => void;
  activeFormation?: boolean;
}

export default function DotGrid({ className, onClick, activeFormation = false }: DotGridProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 }); // NDC −1…1
  const isHovRef = useRef(false);
  const activeFormationRef = useRef(activeFormation);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    activeFormationRef.current = activeFormation;
  }, [activeFormation]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const mount = el;

    const W = mount.clientWidth  || 650;
    const H = mount.clientHeight || 580;

    /* ── Three.js setup ─────────────────────────────────────── */
    const scene    = new THREE.Scene();
    const camera   = new THREE.PerspectiveCamera(75, W / H, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    /* ── Grid geometry ──────────────────────────────────────── */
    const count    = COLS * ROWS;
    const origX    = new Float32Array(count); // resting X
    const origY    = new Float32Array(count); // resting Y
    const velX     = new Float32Array(count); // velocity X
    const velY     = new Float32Array(count); // velocity Y
    const velZ     = new Float32Array(count); // velocity Z
    const posArr   = new Float32Array(count * 3);
    const colArr   = new Float32Array(count * 3);

    const halfCols = (COLS - 1) / 2;
    const halfRows = (ROWS - 1) / 2;
    const maxR     = Math.min(halfCols, halfRows) * SPACING;

    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const i  = c * ROWS + r;
        const x  = (c - halfCols) * SPACING;
        const y  = (r - halfRows) * SPACING;

        origX[i]      = x;
        origY[i]      = y;
        posArr[i * 3]     = x;
        posArr[i * 3 + 1] = y;
        posArr[i * 3 + 2] = 0;

        const fade = radialFade(x, y, maxR);
        colArr[i * 3] = colArr[i * 3 + 1] = colArr[i * 3 + 2] = fade;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colArr, 3));

    const dotTex = makeDotTexture();
    const mat    = new THREE.PointsMaterial({
      size:            DOT_PX,
      map:             dotTex,
      vertexColors:    true,
      transparent:     true,
      opacity:         BASE_OPACITY,
      depthWrite:      false,
      sizeAttenuation: false,
      alphaTest:       0.01,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    /* ── NDC → world-space cursor ───────────────────────────── */
    function cursorWorld() {
      const halfH = Math.tan(((75 * Math.PI) / 180) / 2) * camera.position.z;
      const halfW = halfH * (mount.clientWidth / mount.clientHeight);
      return {
        wx: mouseRef.current.x * halfW,
        wy: mouseRef.current.y * halfH,
      };
    }

    /* ── Animation loop ─────────────────────────────────────── */
    let rafId:    number;
    let needsRun = true; // always animate subtle idle motion
    let lastTime = performance.now();
    let time = 0;

    function animate() {
      rafId = requestAnimationFrame(animate);

      const now = performance.now();
      const dt  = (now - lastTime) * 0.001;
      lastTime = now;
      time += dt;

      const idleOffsetX = Math.sin(time * 0.72) * IDLE_DRIFT_X;
      const idleOffsetY = Math.cos(time * 0.46) * IDLE_DRIFT_Y;
      points.position.set(idleOffsetX, idleOffsetY, 0);

      const metaballTime = time * METABALL_SPEED;
      const isHov      = isHovRef.current;
      const activeForm = activeFormationRef.current;
      const pos        = geo.attributes.position.array as Float32Array;
      const { wx, wy } = isHov ? cursorWorld() : { wx: 0, wy: 0 };

      let moving = false;

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const cx = pos[i3];     // current x
        const cy = pos[i3 + 1]; // current y
        const baseX = origX[i];
        const baseY = origY[i];
        const cz = pos[i3 + 2];

        let targetX = baseX;
        let targetY = baseY;
        let targetZ = 0;

        if (activeForm) {
          const theta = Math.atan2(baseY, baseX) + Math.sin(time * 0.9 + baseX * 1.6) * 0.2;
          const baseR = Math.sqrt(baseX * baseX + baseY * baseY);
          const ringRadius = 2.2 + Math.sin(time * 0.65 + baseR * 1.25) * 0.2;
          targetX = Math.cos(theta) * ringRadius + Math.sin(baseY * 3.8 + time * 1.4) * 0.1;
          targetY = Math.sin(theta) * ringRadius + Math.cos(baseX * 3.8 + time * 1.9) * 0.1;
          targetZ = Math.sin(theta * 3.2 + time * 1.05) * 0.14 + Math.cos(baseR * 2.3 + time * 0.7) * 0.06;
        } else {
          for (let m = 0; m < METABALL_COUNT; m++) {
            const phase = metaballTime + m * Math.PI * 0.95;
            const mbX = Math.sin(phase * METABALL_FREQ_X + m * 1.7) * METABALL_RADIUS * 0.9;
            const mbY = Math.cos(phase * METABALL_FREQ_Y - m * 1.1) * METABALL_RADIUS * 0.7;
            const dx = baseX - mbX;
            const dy = baseY - mbY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0.0001) {
              const influence = Math.exp(-Math.pow(dist / METABALL_RADIUS, METABALL_DECAY)) * METABALL_STRENGTH;
              targetX += (mbX - baseX) * influence;
              targetY += (mbY - baseY) * influence;
              targetZ += Math.sin(phase + baseX * 1.6 + baseY * 1.3) * 0.22 * influence;
            }
          }
        }

        // ── Spring force: pulls toward idling target position ────
        const sx = (targetX - cx) * SPRING_K;
        const sy = (targetY - cy) * SPRING_K;
        const sz = (targetZ - cz) * SPRING_K;

        // ── Repulsion force: pushes away from cursor ───────
        let rx = 0, ry = 0;
        if (isHov) {
          const dx   = cx - wx;
          const dy   = cy - wy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < REPEL_RADIUS && dist > 0.001) {
            // Quadratic falloff — stronger up close
            const t     = 1 - dist / REPEL_RADIUS;
            const force = REPEL_FORCE * t * t;
            const inv   = 1 / dist;
            rx = dx * inv * force;
            ry = dy * inv * force;
          }
        }

        // ── Integrate: apply forces, then friction ─────────
        velX[i] = (velX[i] + sx + rx) * FRICTION;
        velY[i] = (velY[i] + sy + ry) * FRICTION;
        velZ[i] = (velZ[i] + sz) * FRICTION;

        // Snap micro-velocities to zero so we can detect true rest
        if (Math.abs(velX[i]) < REST_EPS) velX[i] = 0;
        if (Math.abs(velY[i]) < REST_EPS) velY[i] = 0;

        pos[i3]     = cx + velX[i];
        pos[i3 + 1] = cy + velY[i];
        pos[i3 + 2] = cz + velZ[i];

        if (velX[i] !== 0 || velY[i] !== 0 || velZ[i] !== 0) moving = true;
      }

      needsRun = moving || isHov;
      geo.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
    }

    animate();

    /* ── Events ─────────────────────────────────────────────── */
    // Listen on window so overlay siblings (idleContent, etc.) don't swallow events.
    function onMove(e: MouseEvent) {
      const r = mount.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right &&
                     e.clientY >= r.top  && e.clientY <= r.bottom;

      const wasHov = isHovRef.current;
      if (inside !== wasHov) {
        isHovRef.current = inside;
        needsRun         = true;
        setHovered(inside);
      }

      if (inside) {
        mouseRef.current.x =  ((e.clientX - r.left) / r.width)  * 2 - 1;
        mouseRef.current.y = -((e.clientY - r.top)  / r.height) * 2 + 1;
        needsRun = true;
      }
    }

    window.addEventListener('mousemove', onMove);

    function onResize() {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener('resize', onResize);

    // Initial render so dots are visible from the start
    renderer.render(scene, camera);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMove);
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
      geo.dispose();
      mat.dispose();
      dotTex.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className={className}
      style={{ width: '100%', height: '100%', cursor: hovered ? 'crosshair' : 'default' }}
      onClick={onClick}
    />
  );
}
