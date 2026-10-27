import { useEffect, useRef } from 'react';

/**
 * useLabLoop — the shared 2D lab canvas loop.
 *
 * Owns exactly three concerns so every lab gets them right for free:
 *  1. Device-pixel-ratio aware sizing driven by the parent frame (never the
 *     page) so the canvas can never shrink itself.
 *  2. A requestAnimationFrame loop that calls step(dt) then draw(ctx, w, h).
 *     `dt` is in seconds, clamped to 50 ms; `w`/`h` are logical CSS pixels —
 *     the ctx transform is already set to dpr scale, so labs draw in CSS px.
 *  3. Cleanup on unmount.
 *
 * The canvas must be the direct child of the .scene-frame element (LabShell
 * guarantees this). Labs attach their own pointer handlers to the canvas.
 */
export function useLabLoop(opts: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  step: (dt: number, nowS: number) => void;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}) {
  const sizeRef = useRef({ w: 0, h: 0 });
  // Keep the loop pointed at the LATEST closures — the effect below runs once,
  // so a captured opts object would freeze every state read inside step/draw
  // at its first-render values (the classic stale-closure trap).
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const canvas = opts.canvasRef.current;
    if (!canvas) return;
    const frame = canvas.parentElement;
    if (!frame) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    let disposed = false;

    const resize = () => {
      const rect = frame.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      // Buffer-only resize: the drawing buffer follows the frame; CSS stays 100%.
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(frame);

    const tick = (t: number) => {
      if (disposed) return;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      optsRef.current.step(dt, t / 1000);
      const { w, h } = sizeRef.current;
      optsRef.current.draw(ctx, w, h);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return sizeRef;
}
