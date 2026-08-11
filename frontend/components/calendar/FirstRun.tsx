/**
 * What the calendar says to an account that has captured nothing (T068, spec Edge Cases).
 *
 * Built from the export's `First run 375` panel (`1k` dark / `2k` light) — the same panel T035 took
 * the backlog drawer's empty copy from, which is why the two surfaces already agree.
 *
 * ## Three empty states, and this is the first of them
 *
 * The spec's edge case is *"First run with no items at all"*, and the condition is exactly that:
 * **no item exists on the account**, not "no item falls in the period on screen". The calendar's read
 * is unparameterised (R-007), so the loaded list *is* the account, and an empty one means the creator
 * has never captured anything. The other two are already decided and this one must not overlap them:
 *
 * - **This period is empty** — ordinary. The items exist, the period arrows answer it, and drawing
 *   an explanation over an empty March while April is full would be telling the creator something is
 *   wrong when navigating is the answer.
 * - **The filter hid everything** — `FilteredEmpty`, which is deliberately gated on `items.length > 0`
 *   so that a creator with nothing captured meets *this* panel instead. A filter is not why their
 *   calendar is empty, and pointing them at a filter to clear would waste the one tap they have.
 *
 * ## It accompanies the grid rather than replacing it
 *
 * The opposite of `FilteredEmpty`, and the export draws the difference: `1i` puts a dashed region
 * *where the grid would be*, while `1k` keeps the six-week grid and centres the message over it. The
 * reason is what the two states ask the creator to do. The filtered one asks them to clear a filter,
 * so the region is the explanation and an empty grid above it would just be a blank screen. This one
 * asks them to capture an idea and then **drag it onto a day** — and a sentence about days, with no
 * days on screen, explains nothing.
 *
 * It also keeps the structural tests honest: `month-grid.spec.ts` asserts the 42-cell span and
 * `week-list.spec.ts` the seven sections **against an empty list**, because an empty list is the
 * cleanest fixture for a question about structure. A first-run state that removed the grid would put
 * a decoy item into every one of those tests.
 *
 * ## The copy names `+ Capture`, and the export named it by renaming the button
 *
 * The export's `1k` points at capture by widening the action band's button to `+ CAPTURE FIRST IDEA`.
 * That is not available here, and it was **measured rather than reasoned about** — the same way the
 * T077 amendment measured the band at 356px of the 375px floor. Swapping the label in the live band
 * at 375px: `+ CAPTURE` is **97px wide, ending at x=359**; `+ CAPTURE FIRST IDEA` is **168px, ending
 * at x=411 — 36px past the right edge** — and `document.documentElement.scrollWidth >
 * clientWidth` stays **`false`** throughout, because the band clips instead of scrolling. The
 * primary action would leave the screen with nothing to announce it. That is why
 * `first-run.spec.ts` measures the band's controls against the viewport rather than trusting the
 * overflow check.
 *
 * So the pointer moves into the copy instead, and it names the control by the label the creator can
 * see. The rest of the sentence is the export's, including the drag — which T035 was right to hold
 * back and which is safe to say now that T054 exists.
 */
export function FirstRun() {
  return (
    <div
      // `.web-grain` is the export's faint texture, and it does the job the dashed border does on
      // `FilteredEmpty`: it marks the band as a deliberate part of the surface rather than a gap.
      // No dashed border here — that treatment says "the region you expected is absent", and the
      // grid it would be describing is directly below, present.
      className="border-hairline web-grain flex flex-col items-center gap-2 border-b px-6 py-8 text-center"
      data-testid="first-run"
    >
      {/*
       * `role="status"` for the same reason `FilteredEmpty`'s headline carries one: this appears when
       * the first read resolves, with no navigation to announce it, so a screen-reader user would
       * otherwise be told nothing about why the calendar they just opened is blank.
       */}
      <p
        role="status"
        className="font-display text-ink text-[17px] leading-tight font-semibold tracking-[0.14em] uppercase"
        data-testid="first-run-headline"
      >
        {/* T051 (comic-tech brief §11): personality wording, adapted rather than copied from the
            brief's own "NO MISSIONS YET" example — this product's own voice, not a lifted line. */}
        No missions on the board yet
      </p>

      {/* "+ New" (002 T024), matching the action band's label since T016 restyled it. */}
      <p className="text-ink-mid max-w-[260px] text-[13px] leading-relaxed">
        Tap <b className="text-ink">+ New</b> to log one. It drops into the backlog below — drag
        it onto a day when you&apos;re ready to ship.
      </p>
    </div>
  );
}
