import { useEffect, useRef } from 'react';

export interface CurvePoint {
  v: number;
  ph: number;
}

interface Props {
  history: CurvePoint[];
  endpoint: boolean;
  liveVolume: number;
  livePh: number;
}

/**
 * A small live-drawn titration curve (pH vs volume of titrant added).
 * Rendered on a 2D canvas so it costs almost nothing on low-end phones.
 * Shows the steep equivalence jump, the phenolphthalein transition band
 * (pH 8.2–10) and the student's current position on the curve.
 */
export default function pHChart({ history, endpoint, liveVolume, livePh }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(220, Math.round(rect.width));
      const h = 210;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.height = `${h}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Plot area with margins for axis labels.
      const ml = 34, mr = 10, mt = 14, mb = 30;
      const pw = w - ml - mr;
      const ph = h - mt - mb;
      const xOf = (v: number) => ml + (v / 30) * pw;
      const yOf = (phv: number) => mt + (1 - phv / 14) * ph;

      // Grid.
      ctx.strokeStyle = '#edf0f4';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let v = 0; v <= 30; v += 5) {
        ctx.moveTo(xOf(v), mt);
        ctx.lineTo(xOf(v), mt + ph);
      }
      for (let p = 0; p <= 14; p += 2) {
        ctx.moveTo(ml, yOf(p));
        ctx.lineTo(ml + pw, yOf(p));
      }
      ctx.stroke();

      // Phenolphthalein transition band (pH 8.2 → 10).
      ctx.fillStyle = 'rgba(207, 77, 149, 0.09)';
      ctx.fillRect(ml, yOf(10), pw, yOf(8.2) - yOf(10));
      ctx.strokeStyle = 'rgba(207, 77, 149, 0.35)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(ml, yOf(8.2));
      ctx.lineTo(ml + pw, yOf(8.2));
      ctx.moveTo(ml, yOf(10));
      ctx.lineTo(ml + pw, yOf(10));
      ctx.stroke();
      ctx.setLineDash([]);

      // Equivalence line at 25 mL.
      ctx.strokeStyle = '#94a3b8';
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(xOf(25), mt);
      ctx.lineTo(xOf(25), mt + ph);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#8a96a4';
      ctx.font = '700 9px Manrope, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('EQ 25.00 mL', xOf(25), mt - 3);

      // The curve so far.
      if (history.length > 1) {
        ctx.strokeStyle = endpoint ? '#cf4d95' : '#e8632a';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        history.forEach((pt, i) => {
          const x = xOf(pt.v);
          const y = yOf(Math.max(0, Math.min(14, pt.ph)));
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Live point.
        const lx = xOf(liveVolume);
        const ly = yOf(Math.max(0, Math.min(14, livePh)));
        ctx.fillStyle = endpoint ? '#cf4d95' : '#f97316';
        ctx.beginPath();
        ctx.arc(lx, ly, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Axes + tick labels.
      ctx.fillStyle = '#7d8a99';
      ctx.font = '600 9px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      for (let v = 0; v <= 30; v += 10) ctx.fillText(String(v), xOf(v), h - 16);
      ctx.fillText('NaOH added (mL)', ml + pw / 2, h - 4);
      ctx.textAlign = 'right';
      for (let p = 0; p <= 14; p += 2) ctx.fillText(String(p), ml - 6, yOf(p) + 3);
      ctx.save();
      ctx.translate(10, mt + ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText('pH', 0, 0);
      ctx.restore();
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [history, endpoint, liveVolume, livePh]);

  return <canvas ref={canvasRef} className="ph-chart" aria-label="Live pH titration curve" role="img" />;
}
