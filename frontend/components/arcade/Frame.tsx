import type { ReactNode } from "react";

/**
 * The reference's bevelled machine housing (design/002-pixel-arcade-skin/BRIEF.md), around the
 * working area of every screen (FR-001). Purely decorative: the four corner rivets carry
 * `aria-hidden` and no interactive role, because this iteration adds no actions and a button-shaped
 * element that does nothing is a wasted tap target (T007's own task line).
 *
 * `.arcade-frame`'s padding *is* the frame's thickness end to end — see `app/globals.css` for the
 * FR-008 reasoning and the 10px-at-375px number.
 *
 * **Wired once, at `app/layout.tsx`, around every route** — not per surface. FR-001 asks for one
 * frame everywhere, and wiring it at the single root avoids fourteen call sites each having to
 * remember it.
 *
 * That single wiring point is what makes the height chain below load-bearing rather than optional.
 * `CalendarShell` used to own `h-dvh` outright (`frontend/AGENTS.md`'s "h-dvh, not min-h-dvh" trap);
 * now `body` is the one true `h-dvh`, and everything between it and `<main>`'s own `overflow-y-auto`
 * — this component included — has to be `h-full`/`flex-1 min-h-0` to pass that height down
 * unshrunk. Breaking either half reproduces the exact failure that trap describes: a `min-h-*`
 * anywhere in the chain gives `<main>` nothing to shrink against, and the action band goes below the
 * fold instead of staying under the thumb.
 */
export function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="arcade-frame relative flex h-full flex-col">
      <span aria-hidden className="arcade-frame__rivet left-1 top-1" />
      <span aria-hidden className="arcade-frame__rivet right-1 top-1" />
      <span aria-hidden className="arcade-frame__rivet left-1 bottom-1" />
      <span aria-hidden className="arcade-frame__rivet right-1 bottom-1" />
      <div className="bg-void flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
