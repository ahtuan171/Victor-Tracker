/**
 * Sound cues, synthesised in the browser (T038, research.md R-004, FR-020–FR-023a).
 *
 * Five short cues generated with the Web Audio API — one oscillator through a gain envelope per
 * call — created lazily on the first cue that is actually wanted. No audio files, no `<audio>`
 * elements, no library: R-004 rejected an asset set on cost, not on quality, given the cold path
 * already measured 44s at T072 and this product adds no bytes to it.
 *
 * ## Enabled state lives here, not in a component
 *
 * `CalendarShell` triggers writes (`createItem`, `updateItem`, `deleteItem`) and `NavDrawer` holds
 * the toggle — two different places that both need to know "is sound on right now" with neither
 * owning the other. Rather than thread a boolean through every call site, this module keeps the
 * single cached answer (`enabled`, mirroring `lib/theme.ts`'s cookie-as-cache pattern) and a tiny
 * pub/sub so `NavDrawer`'s toggle re-renders on a change it did not itself cause — the account's own
 * value arriving from `getPreferences()` on mount, in `CalendarShell`'s existing reconciliation
 * effect.
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

/** FR-023a's five cues: one per data-changing action, plus the refusal every one of them can meet. */
export type SoundCue = "capture" | "save" | "delete" | "move" | "refuse";

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
 * (a tap, applied immediately — T040, "off is immediate") and `CalendarShell`'s mount-time
 * reconciliation of the account's own preference (mirroring `reconcileTheme`, one effect covering
 * both preferences from the one `GET /preferences` read).
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
  if (!enabled) return;

  try {
    const ctx = ensureContext();
    if (ctx === null) return;

    const { frequencies, duration, type } = CUES[cue];
    const now = ctx.currentTime;

    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequencies[0]!, now);
    for (let step = 1; step < frequencies.length; step += 1) {
      oscillator.frequency.linearRampToValueAtTime(
        frequencies[step]!,
        now + (duration * step) / frequencies.length,
      );
    }

    // A short attack/decay envelope rather than a hard on/off, which would click. Peaked well under
    // full scale — these accompany a tap, not announce one across a room.
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);

    // Autoplay policy requires the context to have been created or resumed as a result of a user
    // gesture — satisfied by construction, per R-004: every caller of `playCue` sits at the end of a
    // save/delete/capture/drag handler, which is always gesture-initiated, even once the outcome it
    // reports (success or refusal) arrives after an `await`.
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  } catch {
    // FR-023: swallowed. Nothing here may become a visible error.
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

/**
 * One oscillator per cue (never more), which is what makes "a data-changing action produces exactly
 * one cue" (T041) the same fact as "exactly one `createOscillator` call" — distinctness comes from
 * each cue's own frequency contour, not from stacking tones. `square` for every success cue matches
 * the pixel-arcade language the rest of this iteration draws in; `refuse` is `sawtooth` and the only
 * cue that falls in pitch and lingers, so it cannot be mistaken for a success even in isolation.
 */
const CUES: Record<
  SoundCue,
  { readonly frequencies: readonly number[]; readonly duration: number; readonly type: OscillatorType }
> = {
  capture: { frequencies: [392, 784], duration: 0.09, type: "square" },
  save: { frequencies: [523, 784], duration: 0.07, type: "square" },
  move: { frequencies: [523, 659], duration: 0.055, type: "square" },
  delete: { frequencies: [587, 294], duration: 0.13, type: "square" },
  refuse: { frequencies: [220, 165], duration: 0.16, type: "sawtooth" },
};
