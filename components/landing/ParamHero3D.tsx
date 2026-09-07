"use client";

import { useEffect, useRef } from "react";
// Types only — the runtime import below is dynamic, so three never lands in the
// first-paint bundle.
import type * as THREE from "three";

/**
 * The login backdrop: a paperbook, drifting.
 *
 * Sheets of paper stacked with the small imperfections a real bundle has, two
 * of them stamped gold — the defects sitting in the middle of an otherwise
 * clean filing. It is the product in one image, so it earns the WebGL.
 *
 * three.js is imported dynamically so it never lands in the first-paint bundle.
 *
 * Under prefers-reduced-motion the stack is still drawn — once, as a single
 * still frame, with no animation loop and no pointer tracking. That reading of
 * the preference is the correct one: the user asked for less motion, not for a
 * blank page, and the image is doing work here.
 */

const SHEETS = 16;
/** Which sheets are stamped as defective. */
const FLAGGED = new Set([4, 11]);

export default function ParamHero3D() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      if (disposed || !mountRef.current) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      // Raised and pulled right: the copy owns the left half of the screen, so
      // the stack sits where there is nothing to read.
      camera.position.set(0.4, 5.0, 7.4);
      camera.lookAt(2.3, -0.4, 0);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
      renderer.setClearColor(0x000000, 0);
      // Clamp DPR: a 3x retina display gains nothing here and costs frames.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      mount.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0xffffff, 0.62));
      const key = new THREE.DirectionalLight(0xfff4e0, 1.15);
      key.position.set(4, 7, 6);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x7fa6d8, 0.5);
      rim.position.set(-6, -2, -4);
      scene.add(rim);

      // The stack. A paperbook is bound at the left edge, so the sheets fan
      // slightly from a common spine rather than sitting perfectly square.
      const stack = new THREE.Group();
      const geo = new THREE.BoxGeometry(3.5, 0.022, 4.8);
      const sheets: { mesh: THREE.Mesh; seed: number }[] = [];

      for (let i = 0; i < SHEETS; i++) {
        const flagged = FLAGGED.has(i);
        const mat = new THREE.MeshStandardMaterial({
          color: flagged ? 0xd8a44e : 0xf6f1e7,
          roughness: 0.94,
          metalness: 0.02,
          emissive: flagged ? 0x3a2708 : 0x000000,
          emissiveIntensity: flagged ? 0.32 : 0,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
          (Math.random() - 0.5) * 0.16,
          i * 0.105 - (SHEETS * 0.105) / 2,
          (Math.random() - 0.5) * 0.16
        );
        mesh.rotation.y = (Math.random() - 0.5) * 0.05;
        stack.add(mesh);
        sheets.push({ mesh, seed: Math.random() * Math.PI * 2 });
      }
      // Tilted well off edge-on so the sheets read as paper, not as stripes.
      stack.rotation.set(0.10, 0.55, 0.04);
      stack.position.set(3.6, -0.2, -1.2);
      // Backdrop, not subject: small enough that the copy stays the focus.
      stack.scale.setScalar(0.66);
      scene.add(stack);

      // Pointer parallax, eased rather than tracked directly. Not bound under
      // reduced motion — a stack that follows the cursor is still motion.
      const target = { x: 0, y: 0 };
      const eased = { x: 0, y: 0 };
      const onMove = (e: PointerEvent) => {
        target.x = (e.clientX / window.innerWidth - 0.5) * 0.4;
        target.y = (e.clientY / window.innerHeight - 0.5) * 0.25;
      };
      if (!reduced) window.addEventListener("pointermove", onMove, { passive: true });

      const resize = () => {
        const el = mountRef.current;
        if (!el) return;
        const { clientWidth: w, clientHeight: h } = el;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(() => {
        resize();
        if (reduced) renderer.render(scene, camera);
      });
      ro.observe(mount);

      let raf = 0;
      const start = performance.now();
      const tick = (now: number) => {
        const t = (now - start) / 1000;
        eased.x += (target.x - eased.x) * 0.045;
        eased.y += (target.y - eased.y) * 0.045;

        stack.rotation.y = 0.55 + Math.sin(t * 0.16) * 0.13 + eased.x;
        stack.rotation.x = 0.10 + eased.y * 0.3;

        // Each sheet breathes independently, so the stack never looks welded.
        for (let i = 0; i < sheets.length; i++) {
          const { mesh, seed } = sheets[i];
          mesh.position.y =
            i * 0.105 - (SHEETS * 0.105) / 2 + Math.sin(t * 0.7 + seed) * 0.012;
        }

        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };

      if (reduced) renderer.render(scene, camera); // one still frame, no loop
      else raf = requestAnimationFrame(tick);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        window.removeEventListener("pointermove", onMove);
        geo.dispose();
        for (const { mesh } of sheets) (mesh.material as THREE.Material).dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === mount)
          mount.removeChild(renderer.domElement);
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden
      className="absolute inset-0 [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full"
    />
  );
}
