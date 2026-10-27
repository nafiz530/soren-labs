import { useEffect, useRef } from 'react';
import { linearFit } from './math';

/**
 * Plot — a reusable live scatter + optional fitted line for lab data.
 * Used for T²–L, V–I, 1/v–1/u style analysis graphs. Draws on a canvas so it
 * stays crisp on every device; redraws on ResizeObserver.
 */
export function Plot(props: {
  points: { x: number; y: number }[];
  xLabel: string;
  yLabel: string;
  /** Draw the least-squares line and report its slope via onFit. */
  fitLine?: boolean;
  onFit?: (fit: { m: number; b: number; r2: number }) => void;
  height?: number;
  /** Optional extra marker, e.g. the live measurement before it is recorded. */
  livePoint?: { x: number; y: number } | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fitRef = useRef(props.onFit);
  fitRef.current = props.onFit;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, rect.width);
      const h = props.height ?? 210;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const pad = { l: 46, r: 14, t: 14, b: 34 };
      const iw = w - pad.l - pad.r;
      const ih = h - pad.t - pad.b;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#f7f9fb';
      ctx.fillRect(pad.l, pad.t, iw, ih);

      const pts = props.points;
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      if (props.livePoint) {
        xs.push(props.livePoint.x);
        ys.push(props.livePoint.y);
      }
      let xMin = Math.min(0, ...xs);
      let xMax = Math.max(...xs, xMin + 1e-9);
      let yMin = Math.min(0, ...ys);
      let yMax = Math.max(...ys, yMin + 1e-9);
      if (xMax - xMin < 1e-6) xMax = xMin + 1;
      if (yMax - yMin < 1e-6) yMax = yMin + 1;
      const span = (v: number, min: number, max: number) => (v - min) / (max - min);

      // grid
      ctx.strokeStyle = '#e8edf2';
      ctx.lineWidth = 1;
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.fillStyle = '#9aa4b1';
      for (let i = 0; i <= 4; i += 1) {
        const x = pad.l + (iw * i) / 4;
        const y = pad.t + (ih * (4 - i)) / 4;
        ctx.beginPath();
        ctx.moveTo(x, pad.t);
        ctx.lineTo(x, pad.t + ih);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(pad.l + iw, y);
        ctx.stroke();
        const xv = xMin + ((xMax - xMin) * i) / 4;
        const yv = yMin + ((yMax - yMin) * i) / 4;
        ctx.textAlign = 'center';
        ctx.fillText(formatTick(xv), x, h - pad.b + 14);
        ctx.textAlign = 'right';
        ctx.fillText(formatTick(yv), pad.l - 6, y + 3);
      }

      // axes
      ctx.strokeStyle = '#c5cdd6';
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t);
      ctx.lineTo(pad.l, pad.t + ih);
      ctx.lineTo(pad.l + iw, pad.t + ih);
      ctx.stroke();

      // labels
      ctx.fillStyle = '#7a8795';
      ctx.textAlign = 'center';
      ctx.fillText(props.xLabel, pad.l + iw / 2, h - 4);
      ctx.save();
      ctx.translate(11, pad.t + ih / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(props.yLabel, 0, 0);
      ctx.restore();

      // fitted line
      if (props.fitLine && pts.length >= 2) {
        const fit = linearFit(pts);
        fitRef.current?.(fit);
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const yA = fit.m * xMin + fit.b;
        const yB = fit.m * xMax + fit.b;
        ctx.moveTo(pad.l + span(xMin, xMin, xMax) * iw, pad.t + ih - span(clampRange(yA, yMin, yMax), yMin, yMax) * ih);
        ctx.lineTo(pad.l + span(xMax, xMin, xMax) * iw, pad.t + ih - span(clampRange(yB, yMin, yMax), yMin, yMax) * ih);
        ctx.stroke();
      }

      // points
      for (const p of pts) {
        const x = pad.l + span(p.x, xMin, xMax) * iw;
        const y = pad.t + ih - span(p.y, yMin, yMax) * ih;
        ctx.fillStyle = '#172334';
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      if (props.livePoint) {
        const x = pad.l + span(props.livePoint.x, xMin, xMax) * iw;
        const y = pad.t + ih - span(props.livePoint.y, yMin, yMax) * ih;
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    render();
    const ro = new ResizeObserver(render);
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.points, props.livePoint, props.xLabel, props.yLabel, props.fitLine, props.height]);

  return <canvas ref={canvasRef} className="lab-plot" style={{ width: '100%', height: props.height ?? 210 }} aria-label={`${props.yLabel} versus ${props.xLabel} plot`} />;
}

function clampRange(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function formatTick(v: number) {
  if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(0);
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
