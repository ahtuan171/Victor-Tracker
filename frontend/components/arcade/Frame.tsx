import type { ReactNode } from "react";

/**
 * The reference's bevelled machine housing (design/002-pixel-arcade-skin/BRIEF.md), around the
 * working area of every screen (FR-001). Purely decorative: the four corner rivets carry
 * `aria-hidden` and no interactive role, because this iteration adds no actions and a button-shaped
 * element that does nothing is a wasted tap target (T007's own task line).
 *
 * `.arcade-frame`'s padding *is* the frame's thickness end to end — see `app/globals.css` for the
 * FR-008 reasoning and the 10px-at-375px number. Not wired into any route yet: that is a Phase 3
 * task per surface, not this one.
 */
export function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="arcade-frame relative">
      <span aria-hidden className="arcade-frame__rivet left-1 top-1" />
      <span aria-hidden className="arcade-frame__rivet right-1 top-1" />
      <span aria-hidden className="arcade-frame__rivet left-1 bottom-1" />
      <span aria-hidden className="arcade-frame__rivet right-1 bottom-1" />
      <div className="bg-void">{children}</div>
    </div>
  );
}
