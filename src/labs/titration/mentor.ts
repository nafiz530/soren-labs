/**
 * The lab mentor: guided procedure steps, contextual coaching lines and
 * achievement badges. Pure data + derived logic — no React here, so it is
 * trivial to test or extend with more experiments later.
 */

export interface MentorStep {
  id: string;
  title: string;
  detail: string;
  /** Short reminder shown inside the step row while it is the active step. */
  hint: string;
}

export const MENTOR_STEPS: MentorStep[] = [
  {
    id: 'inspect',
    title: 'Inspect the apparatus',
    detail:
      'Look around the bench: the burette clamped above the flask, the stopcock that controls the flow, the conical flask with indicator, and the white tile underneath (it makes colour changes easier to see). Drag the scene to look around.',
    hint: 'Drag anywhere on the 3D scene to orbit the camera.',
  },
  {
    id: 'open',
    title: 'Open the stopcock',
    detail:
      'Press and HOLD the stopcock control. Titrant flows only while your hand keeps the valve open — exactly like the real thing. Release to stop instantly. Deliver about 5 mL.',
    hint: 'Hold the button down; liquid flows while you hold.',
  },
  {
    id: 'swirl',
    title: 'Swirl to mix',
    detail:
      'Move your pointer in circles on the round swirl pad, the way you would rotate a real flask. Listen to the liquid roll around the glass and watch it wobble in 3D.',
    hint: 'Drag in circles on the round pad.',
  },
  {
    id: 'bulk',
    title: 'Run a steady stream to ~20 mL',
    detail:
      'Keep the stopcock open and let the titrant flow. The pH climbs slowly at first — you are still far from the equivalence point, so a steady stream is safe here.',
    hint: 'Hold to flow; release to pause and read the burette.',
  },
  {
    id: 'careful',
    title: 'Slow down — drop by drop',
    detail:
      'Past 20 mL every pulse delivers only 0.1 mL. Watch for pink flashes that fade when you swirl: they warn you that the equivalence point is very close.',
    hint: 'Short taps now — one drop at a time.',
  },
  {
    id: 'endpoint',
    title: 'Catch the permanent pink',
    detail:
      'Keep adding single drops and swirling after each one. The drop that leaves a pink colour that survives swirling is your endpoint. Aim for the faintest pink you can see — deep pink means you overshot.',
    hint: 'One drop, swirl, look. Repeat.',
  },
  {
    id: 'record',
    title: 'Record and repeat',
    detail:
      'Open the Observations tab and record this trial. Then reset and repeat the titration — real chemists run at least three trials and compare how close their endpoint volumes are.',
    hint: 'Record the trial, then reset and beat your accuracy.',
  },
];

export interface BadgeDef {
  id: string;
  icon: string;
  title: string;
  detail: string;
}

export const BADGES: BadgeDef[] = [
  { id: 'first-drop', icon: '◌', title: 'First drop', detail: 'Opened the stopcock for the first time.' },
  { id: 'swirl-master', icon: '↻', title: 'Swirl master', detail: 'Swirled the flask a full 10 revolutions.' },
  { id: 'steady-hands', icon: '⌖', title: 'Steady hands', detail: 'Reached 24.5 mL with clean, controlled additions.' },
  { id: 'sharp-eye', icon: '◉', title: 'Sharp eye', detail: 'Stopped within 0.2 mL of the true endpoint.' },
  { id: 'repetition', icon: '≡', title: 'Repetition', detail: 'Recorded two trials within 0.2 mL of each other.' },
  { id: 'complete', icon: '✓', title: 'Lab complete', detail: 'Finished the full guided procedure.' },
];

export interface LabSnapshot {
  volume: number;
  endpoint: boolean;
  overshot: boolean;
  drops: number;
  swirlTurns: number;
  hasSwirledEver: boolean;
  trials: number;
}

/**
 * The coach line: what the mentor says right now, derived from the state of
 * the experiment. Priority ordered — the most urgent situation wins.
 */
export function coachLine(s: LabSnapshot): { line: string; tone: 'idle' | 'info' | 'warn' | 'good' } {
  if (s.overshot) {
    return {
      tone: 'warn',
      line: 'Overshot — that deep pink means you went past the endpoint. Note it in your log, reset, and try to stop one drop earlier.',
    };
  }
  if (s.endpoint) {
    return {
      tone: 'good',
      line: 'That pink stays even while swirling — this is your endpoint. Stop adding titrant and record the volume.',
    };
  }
  if (s.volume >= 24.6) {
    return {
      tone: 'info',
      line: 'Very close now. Single drops only: add 0.1 mL, swirl, and look. The pink flash that survives swirling is your endpoint.',
    };
  }
  if (s.volume >= 25) {
    return {
      tone: 'info',
      line: 'Exactly 25.00 mL — the equivalence point. One more drop will push the pH past 10. Ready?',
    };
  }
  if (s.volume >= 20) {
    return {
      tone: 'info',
      line: 'Entering the endpoint zone — the stopcock now meters 0.1 mL per pulse. Ease off the stream.',
    };
  }
  if (s.volume >= 5 && !s.hasSwirledEver && s.drops >= 3) {
    return {
      tone: 'info',
      line: 'Several additions without swirling. Swirl the flask so the titrant mixes evenly before judging the colour.',
    };
  }
  if (s.volume === 0) {
    return {
      tone: 'idle',
      line: 'Hold the stopcock to start adding NaOH. The indicator will turn pink when you have added exactly enough.',
    };
  }
  return {
    tone: 'idle',
    line: 'Keep going — steady hands, steady stream. Watch the pH curve start to bend as you approach 25 mL.',
  };
}

export interface TrialRecord {
  id: number;
  volume: number;
  ph: number;
  drops: number;
  seconds: number;
  swirlTurns: number;
  accurate: boolean;
}

export function fmtClock(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/* ========================================================================== *
 * Smart guidance ("nudge"): when the student is idle or clicking around
 * without understanding, the lab animates a pointing hand over the exact
 * control they should use next, and demonstrates the gesture itself.
 * ========================================================================== */

/** Which control the animated hand should point at. */
export type NudgeTargetId = 'scene' | 'dispense' | 'swirl' | 'observations' | 'record' | 'reset';

/** The gesture the animated hand performs to demonstrate the action. */
export type NudgeGesture = 'press' | 'tap' | 'circle' | 'drag' | 'point';

export interface NudgePlan {
  target: NudgeTargetId;
  gesture: NudgeGesture;
  /** Short bold headline for the guidance bubble. */
  title: string;
  /** One-line instruction shown under the headline. */
  line: string;
}

export interface NudgeState {
  mentorIndex: number;
  endpoint: boolean;
  overshot: boolean;
  trials: number;
}

/**
 * Work out what to demonstrate right now. Returns null when the student is
 * doing fine and there is nothing worth pointing at.
 */
export function nudgePlan(s: NudgeState): NudgePlan | null {
  if (s.overshot) {
    return {
      target: 'reset',
      gesture: 'point',
      title: 'Too far past the endpoint',
      line: 'The deep pink means you overshot. Reset the bench and try stopping one drop earlier.',
    };
  }
  if (s.endpoint) {
    return s.trials === 0
      ? {
          target: 'observations',
          gesture: 'point',
          title: 'You found the endpoint',
          line: 'Open the Observations tab and record this trial before the moment escapes.',
        }
      : {
          target: 'reset',
          gesture: 'point',
          title: 'Trial recorded — now repeat it',
          line: 'Reset and run it again. Real chemists average three trials and compare the spread.',
        };
  }
  switch (s.mentorIndex) {
    case 0:
      return {
        target: 'scene',
        gesture: 'drag',
        title: 'Look around the bench first',
        line: 'Drag the 3D scene sideways to orbit the camera and inspect the apparatus.',
      };
    case 1:
      return {
        target: 'dispense',
        gesture: 'press',
        title: 'Open the stopcock',
        line: 'Press and HOLD this button — titrant flows only while your finger keeps it down.',
      };
    case 2:
      return {
        target: 'swirl',
        gesture: 'circle',
        title: 'Swirl the flask',
        line: 'Drag in circles on this round pad — the way you would rotate a real flask.',
      };
    case 3:
      return {
        target: 'dispense',
        gesture: 'press',
        title: 'Keep the stream going',
        line: 'Hold the stopcock again and let the titrant run steadily toward 20 mL.',
      };
    case 4:
      return {
        target: 'dispense',
        gesture: 'tap',
        title: 'Slow down — drop by drop',
        line: 'Short taps only now: each press delivers just 0.1 mL past 20 mL.',
      };
    case 5:
      return {
        target: 'dispense',
        gesture: 'tap',
        title: 'Hunt the permanent pink',
        line: 'One tap, then swirl. Stop the moment pink survives the swirl.',
      };
    case 6:
      return {
        target: 'observations',
        gesture: 'point',
        title: 'Record your trial',
        line: 'Open Observations and record this endpoint, then reset and repeat.',
      };
    default:
      return null;
  }
}
