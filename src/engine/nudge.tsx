import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Smart guidance engine ("nudge") — shared by every lab.
 *
 * If the student clicks the wrong thing or goes quiet for a while, a pulsing
 * ring + an animated demonstrating hand + a short bubble appear over the exact
 * control they should use next. The nudge dissolves the moment they perform
 * the demonstrated action (a pointerdown on the plan's target), times out
 * after 16 s, and per-reason cooldowns keep it from nagging.
 */

export type NudgeGesture = 'point' | 'press' | 'tap' | 'drag' | 'circle';

export interface NudgePlan {
  /** The data-nudge attribute value of the control to highlight. */
  target: string;
  gesture: NudgeGesture;
  title: string;
  body: string;
}

interface NudgeState {
  plan: NudgePlan;
  token: number;
}

const IDLE_MS = 18_000;
const WRONG_WINDOW_MS = 15_000;
const WRONG_THRESHOLD = 3;
const COOLDOWN_MS = 30_000;
const NUDGE_TIMEOUT_MS = 16_000;

export function useNudge(opts: {
  /** Return the plan for the current moment, or null when no guidance applies. */
  getPlan: () => NudgePlan | null;
}) {
  const [nudge, setNudge] = useState<NudgeState | null>(null);
  const lastActivity = useRef(performance.now());
  const wrongs = useRef<number[]>([]);
  const cooldownUntil = useRef(0);
  const getPlanRef = useRef(opts.getPlan);
  getPlanRef.current = opts.getPlan;
  const tokenRef = useRef(0);

  /** Labs call this on every meaningful interaction. productive=false means
   *  the student poked something that does not advance the experiment. */
  const notePointer = useCallback((productive: boolean) => {
    lastActivity.current = performance.now();
    if (productive) {
      wrongs.current.length = 0;
    } else {
      wrongs.current.push(performance.now());
    }
  }, []);

  const dismiss = useCallback((reason: string) => {
    setNudge((cur) => {
      if (reason !== 'timeout') cooldownUntil.current = performance.now() + COOLDOWN_MS;
      return cur ? null : cur;
    });
    if (reason === 'timeout') cooldownUntil.current = performance.now() + COOLDOWN_MS * 0.6;
  }, []);

  // Trigger watcher.
  useEffect(() => {
    const iv = window.setInterval(() => {
      if (nudge) return;
      const t = performance.now();
      if (t < cooldownUntil.current) return;
      const idle = t - lastActivity.current > IDLE_MS;
      wrongs.current = wrongs.current.filter((w) => t - w < WRONG_WINDOW_MS);
      const confused = wrongs.current.length >= WRONG_THRESHOLD;
      if (!idle && !confused) return;
      const plan = getPlanRef.current();
      if (!plan) return;
      // Don't nudge toward something the student just clicked wrongly near.
      tokenRef.current += 1;
      setNudge({ plan, token: tokenRef.current });
      wrongs.current.length = 0;
      lastActivity.current = t;
    }, 1200);
    return () => window.clearInterval(iv);
  }, [nudge]);

  // Auto timeout.
  useEffect(() => {
    if (!nudge) return;
    const to = window.setTimeout(() => dismiss('timeout'), NUDGE_TIMEOUT_MS);
    return () => window.clearTimeout(to);
  }, [nudge, dismiss]);

  // Dissolve when the student acts on the demonstrated target.
  useEffect(() => {
    if (!nudge) return;
    const onDown = (ev: PointerEvent) => {
      const el = ev.target instanceof Element ? ev.target : null;
      if (el && el.closest(`[data-nudge="${nudge.plan.target}"]`)) {
        dismiss('satisfied');
        lastActivity.current = performance.now();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [nudge, dismiss]);

  return { nudge, notePointer, dismiss };
}

/** The overlay: pulsing ring + demonstrating hand + guidance bubble. */
export function NudgeLayer({ plan, onDismiss }: { plan: NudgePlan; onDismiss: () => void }) {
  const ringRef = useRef<HTMLDivElement | null>(null);
  const handRef = useRef<HTMLDivElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  // Re-anchor the ring over its target every frame (targets can move/scroll).
  useEffect(() => {
    let raf = 0;
    const anchor = () => {
      const target = document.querySelector<HTMLElement>(`[data-nudge="${plan.target}"]`);
      const ring = ringRef.current;
      const hand = handRef.current;
      const bubble = bubbleRef.current;
      if (target && ring) {
        const r = target.getBoundingClientRect();
        ring.style.display = 'block';
        ring.style.left = `${r.left - 7}px`;
        ring.style.top = `${r.top - 7}px`;
        ring.style.width = `${r.width + 14}px`;
        ring.style.height = `${r.height + 14}px`;
        if (window.innerWidth < 760) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (hand) {
          hand.style.left = `${r.left + r.width / 2 - 24}px`;
          hand.style.top = `${Math.min(window.innerHeight - 130, r.bottom + 6)}px`;
        }
        if (bubble) {
          const bw = Math.min(252, window.innerWidth - 28);
          let left = r.left + r.width / 2 - bw / 2;
          left = Math.max(14, Math.min(window.innerWidth - bw - 14, left));
          const below = r.bottom + 74;
          const above = r.top - 132;
          bubble.style.left = `${left}px`;
          bubble.style.top = `${below + 130 < window.innerHeight ? below : Math.max(14, above)}px`;
        }
      } else if (ring) {
        ring.style.display = 'none';
      }
      raf = requestAnimationFrame(anchor);
    };
    raf = requestAnimationFrame(anchor);
    return () => cancelAnimationFrame(raf);
  }, [plan.target]);

  return (
    <div className="nudge-layer">
      <div ref={ringRef} className="nudge-ring" />
      <div ref={handRef} className={`nudge-hand gesture-${plan.gesture}`} aria-hidden="true">☞</div>
      <div ref={bubbleRef} className="nudge-bubble">
        <strong>{plan.title}</strong>
        <p>{plan.body}</p>
        <button className="nudge-dismiss" type="button" onClick={onDismiss}>Got it</button>
      </div>
    </div>
  );
}
