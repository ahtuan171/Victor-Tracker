"use client";

import { useEffect, useId, useState } from "react";

/**
 * The one place navigation and settings live (T029, FR-015, FR-016).
 *
 * Built as its own overlay rather than folding into `BacklogDrawer`, because FR-019 requires this to
 * sit **above** that drawer without either trapping the person or cancelling the other. The two are
 * independent pieces of state (this component owns its own `open`), each with its own scrim, and —
 * like the backlog's own expanded panel — neither is a focus trap. A trap here would fight
 * `CaptureSheet`: FR-018 requires dismissing this drawer to leave a capture in progress exactly as it
 * was, and a trap would have first pulled focus away from it.
 *
 * ## What lives here, and when
 *
 * FR-015 requires one place that lists every screen the product has. Today that is the single screen
 * this iteration restyles — Content Calendar — so the list below has one entry; it grows the day a
 * second screen exists, not before (`design/002-pixel-arcade-skin/BRIEF.md`'s DO-NOT-INVENT table is
 * explicit that this iteration adds no new destination). FR-016 also puts the presentation choice, the
 * sound choice, and the way to leave the account here — **T029 builds the shell only.** Sign-out moves
 * in at T030, the theme control at T034, the sound control at T040. Each lands as its own task so the
 * drawer is never wired to a control that does not work yet.
 *
 * ## Slides from the side, not the bottom
 *
 * Every other overlay in the product — `CaptureSheet`, `ItemSheet`, `DeleteConfirm`, the backlog's own
 * expanded panel — rises from the bottom, because each is about the content underneath it. This one is
 * not about any item or day; it is the product's one navigation surface, so a different edge keeps it
 * from reading as a fifth content sheet.
 */
export function NavDrawer() {
  const panelId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    // Escape closes, same as the backlog's own expanded panel — cheap, and the alternative is an
    // overlay a keyboard user can only leave by tabbing all the way to the close button.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        className="border-hairline bg-surface-2 text-ink-mid focus-ring h-11 flex-none rounded-sm border px-2.5 text-xs font-semibold tracking-[0.14em] whitespace-nowrap uppercase"
        data-testid="nav-drawer-trigger"
      >
        Menu
      </button>

      {open ? (
        <>
          {/*
           * Its own scrim, stacked above the backlog drawer's (`z-10`/`z-20`) rather than sharing one
           * with it — FR-019 forbids either overlay cancelling the other, and a shared scrim click
           * would have to guess which one a tap meant.
           */}
          <div
            className="fixed inset-0 z-30 bg-black/40"
            aria-hidden="true"
            onClick={() => setOpen(false)}
            data-testid="nav-drawer-scrim"
          />

          <nav
            id={panelId}
            aria-label="Navigation and settings"
            className="border-hairline bg-surface-1 fixed inset-y-0 right-0 z-40 flex w-[260px] max-w-[80vw] flex-col border-l shadow-e2"
            data-testid="nav-drawer-panel"
          >
            <header className="border-hairline flex items-center justify-between gap-2 border-b px-4 pt-5 pb-3">
              <span className="text-ink text-xs leading-none font-semibold tracking-[0.18em] uppercase">
                Menu
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border-hairline bg-surface-2 text-ink-mid focus-ring h-11 flex-none rounded-sm border px-2.5 text-xs font-semibold tracking-[0.14em] uppercase"
                data-testid="nav-drawer-close"
              >
                Close
              </button>
            </header>

            {/*
             * FR-015's screen list. One entry today, marked current rather than a link — there is
             * nowhere else for it to go yet, and a button that goes nowhere is a wasted tap target
             * (the same rule `Frame.tsx`'s corner rivets follow).
             */}
            <ul className="flex-1 overflow-y-auto p-4" data-testid="nav-drawer-screens">
              <li>
                <span
                  aria-current="page"
                  className="border-hairline bg-surface-2 text-ink flex h-11 items-center rounded-sm border px-3 text-sm font-semibold"
                  data-testid="nav-drawer-screen-calendar"
                >
                  Content Calendar
                </span>
              </li>
            </ul>
          </nav>
        </>
      ) : null}
    </>
  );
}
