/**
 * Sound cues, synthesised in the browser (T038, research.md R-004, FR-020–FR-023a).
 *
 * Short cues generated with the Web Audio API — each a phrase of one to four oscillator notes
 * through a gain envelope — created lazily on the first cue that is actually wanted. No audio
 * files, no `<audio>` elements, no library: nothing is added to the cold-start path.
 *
 * ## Enabled state lives here, not in a component
 *
 * Various write paths (`QuickAdd`, `DestinationSheet`, `TripPanel`, `VisitedPanel`, `PlannedPanel`)
 * call `playCue`, and `NavDrawer` holds the toggle — many places that all need to know "is sound on
 * right now" with none of them owning the other. Rather than thread a boolean through every call
 * site, this module keeps the single cached answer (`enabled`, mirroring `lib/theme.ts`'s
 * cookie-as-cache pattern) and a tiny pub/sub so `NavDrawer`'s toggle re-renders on a change it did
 * not itself cause — the account's own value arriving from `getPreferences()` on mount, in
 * `MapShell`'s reconciliation effect (`CalendarShell`'s successor as the app's shell, since Content
 * Calendar was removed entirely 2026-08-22).
 *
 * FR-022 gives sound no first-paint obligation (unlike the theme), so unlike `ch_theme` there is no
 * cookie: `enabled` starts `false` — which is also FR-020's default — and is corrected once the
 * account's preference has been read. Nothing is heard before that read resolves, and FR-021
 * forbids anything about sound standing in the way regardless.
 *
 * ## Every failure is swallowed (FR-023)
 *
 * `playCue` never throws and its result is never awaited by a caller — the product must behave
 * identically whether or not sound reaches anyone's ears, including when the browser refuses to
 * create or resume an `AudioContext` at all. No code path anywhere may branch on whether a sound
 * played.
 */

/**
 * Data cues (one per data-changing action, plus the refusal every one of them can meet) and UI
 * cues (quieter, for navigation and selection — so the app responds to every touch, not only to
 * writes).
 */
export type SoundCue =
  | "capture"
  | "save"
  | "delete"
  | "move"
  | "refuse"
  | "success"
  | "tap"
  | "select"
  | "open"
  | "close"
  | "page";

let enabled = false;
let context: AudioContext | null = null;
const listeners = new Set<() => void>();

/** `getSnapshot` for `useSyncExternalStore` callers (`NavDrawer`'s toggle). */
export function isSoundEnabled(): boolean {
  return enabled;
}

/**
 * `getServerSnapshot`. Always `false`, matching FR-020's own default — there is no cookie to guess
 * from, so "off" is never a wrong answer for a render that has not yet read the account.
 */
export function isSoundEnabledOnServer(): boolean {
  return false;
}

/**
 * Set the cached enabled state and notify subscribers. Called from two places: `NavDrawer`'s toggle
 * (a tap, applied immediately — T040, "off is immediate") and `MapShell`'s mount-time reconciliation
 * of the account's own preference (mirroring `reconcileTheme`, one effect covering both preferences
 * from the one `GET /preferences` read).
 */
export function setSoundEnabled(next: boolean): void {
  if (next === enabled) return;
  enabled = next;
  listeners.forEach((listener) => listener());
}

/** `subscribe` for `useSyncExternalStore`. No native change event exists here — this module is the
 * only writer, so it can offer a real one, unlike `lib/theme.ts`'s cookie (which has none). */
export function subscribeSoundEnabled(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Play a cue, fire-and-forget (FR-023a).
 *
 * A no-op while sound is off (FR-020) or outside a browser — checked first so no `AudioContext` is
 * ever created for a cue nobody asked to hear. Every step past that is wrapped in one `try`: a
 * browser that refuses to create or resume a context, or any other Web Audio failure, must never
 * surface as an error the caller has to handle (FR-023).
 */
export function playCue(cue: SoundCue): void {
  vibrateFor(cue);
  if (!enabled) return;

  try {
    const ctx = ensureContext();
    if (ctx === null) return;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});

    const { notes, type, gain: peak } = CUES[cue];
    const start = ctx.currentTime + 0.005;

    for (const note of notes) {
      const at = start + note.at;
      const oscillator = ctx.createOscillator();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(note.from, at);
      if (note.to !== undefined) {
        oscillator.frequency.exponentialRampToValueAtTime(note.to, at + note.length);
      }

      // A short attack/decay envelope rather than a hard on/off, which would click.
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + note.length);

      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + note.length + 0.02);
    }
  } catch {
    // FR-023: swallowed. Nothing here may become a visible error.
  }
}

/**
 * A tiny haptic tick on phones that support it, following the same sound toggle — a phone on
 * silent still gets a physical confirmation that a save landed. UI cues stay silent here; buzzing
 * on every tap is noise.
 */
function vibrateFor(cue: SoundCue): void {
  if (!enabled) return;
  const pattern = HAPTICS[cue];
  if (pattern === undefined) return;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignored, as with sound.
  }
}

function ensureContext(): AudioContext | null {
  if (context !== null) return context;
  if (typeof window === "undefined") return null;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctor === undefined) return null;

  context = new Ctor();
  return context;
}

interface Note {
  /** Seconds after the cue starts. */
  readonly at: number;
  readonly from: number;
  /** Glide target, if the note bends. */
  readonly to?: number;
  readonly length: number;
}

/**
 * The pixel-arcade palette: `square` for success cues, `triangle` (softer) for UI cues so they sit
 * under the data cues rather than competing with them, and `sawtooth` only for `refuse` — the one
 * cue that falls in pitch and lingers, so it cannot be mistaken for a success even in isolation.
 */
const CUES: Record<
  SoundCue,
  { readonly notes: readonly Note[]; readonly type: OscillatorType; readonly gain: number }
> = {
  capture: { type: "square", gain: 0.12, notes: [{ at: 0, from: 392, to: 784, length: 0.09 }] },
  save: {
    type: "square",
    gain: 0.1,
    notes: [
      { at: 0, from: 659, length: 0.06 },
      { at: 0.06, from: 988, length: 0.09 },
    ],
  },
  success: {
    type: "square",
    gain: 0.09,
    notes: [
      { at: 0, from: 523, length: 0.07 },
      { at: 0.07, from: 659, length: 0.07 },
      { at: 0.14, from: 784, length: 0.07 },
      { at: 0.21, from: 1047, length: 0.16 },
    ],
  },
  move: { type: "square", gain: 0.1, notes: [{ at: 0, from: 523, to: 659, length: 0.055 }] },
  delete: {
    type: "square",
    gain: 0.1,
    notes: [
      { at: 0, from: 587, length: 0.07 },
      { at: 0.07, from: 392, to: 196, length: 0.14 },
    ],
  },
  refuse: { type: "sawtooth", gain: 0.08, notes: [{ at: 0, from: 220, to: 150, length: 0.18 }] },
  tap: { type: "triangle", gain: 0.06, notes: [{ at: 0, from: 1200, length: 0.025 }] },
  select: { type: "triangle", gain: 0.07, notes: [{ at: 0, from: 880, to: 1320, length: 0.045 }] },
  open: { type: "triangle", gain: 0.06, notes: [{ at: 0, from: 330, to: 660, length: 0.09 }] },
  close: { type: "triangle", gain: 0.05, notes: [{ at: 0, from: 660, to: 330, length: 0.08 }] },
  page: { type: "triangle", gain: 0.05, notes: [{ at: 0, from: 520, to: 780, length: 0.05 }] },
};

const HAPTICS: Partial<Record<SoundCue, number | number[]>> = {
  save: 12,
  success: [12, 40, 18],
  capture: 12,
  delete: [20, 30, 20],
  refuse: [30, 40, 30],
};
