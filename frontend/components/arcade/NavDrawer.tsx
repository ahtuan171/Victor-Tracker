"use client";

import { useEffect, useId, useState } from "react";

import { logout } from "@/lib/api";

/**
 * The one place navigation and settings live (T029–T030, FR-015, FR-016, FR-017).
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
 * explicit that this iteration adds no new destination). FR-016 also puts the presentation choice and
 * the sound choice here — **not yet**: the theme control lands at T034, the sound control at T040,
 * each its own task so this drawer is never wired to a control that does not work yet.
 *
 * **Sign-out moved in at T030**, self-contained here rather than threaded down as a prop from
 * `CalendarShell` — the same reason this component takes no props at all: every screen that will ever
 * mount `NavDrawer` gets a working sign-out for free, with nothing for a future screen to wire up.
 * The behaviour is carried over unchanged from T077's header control: `logout()` already swallows a
 * 401 (the session was already over, which is where sign-out was going), so anything reaching the
 * `catch` below is a session that is still genuinely open, and only the proxy can clear that httpOnly
 * cookie — so a refused sign-out leaves the creator here, on the calendar, told why, rather than
 * bounced to `/login` with a session that never actually ended.
 *
 * **FR-017 ("further from the resting position of a thumb than the actions used frequently")**: two
 * taps deep now rather than one — open the drawer, then sign out — where the header control was a
 * single tap. It sits in a footer **below** the screen list, the drawer's own "far end", rather than
 * beside it.
 *
 * ## Slides from the side, not the bottom
 *
 * Every other overlay in the product — `CaptureSheet`, `ItemSheet`, `DeleteConfirm`, the backlog's own
 * expanded panel — rises from the bottom, because each is about the content underneath it. This one is
 * not about any item or day; it is the product's one navigation surface, so a different edge keeps it
 * from reading as a fifth content sheet.
 *
 * ## It has to out-rank `z-50`, not just the backlog's `z-10`/`z-20`
 *
 * `CaptureSheet`, `ItemSheet` and `DeleteConfirm` all share the shadcn `Sheet`/`AlertDialog`
 * primitives, whose backdrop and content both sit at `z-50` — and, being portalled to `document.body`
 * with `position: fixed`, that backdrop paints over the *entire* viewport, including this drawer's own
 * trigger sitting quietly in the header at no explicit stacking level at all. T031's FR-018 scenario
 * ("dismissing the nav drawer over an open capture sheet keeps the typed text") is not just a state
 * assertion — it requires the trigger to still be **reachable** while that backdrop is up, which a
 * `z-40` panel cannot do against a `z-50` one. `z-[60]`/`z-[70]`/`z-[80]` below are deliberately past
 * every sheet in the product, not merely past the one non-modal overlay (the backlog drawer) T029's
 * task line names.
 */
export function NavDrawer() {
  const panelId = useId();
  const [open, setOpen] = useState(false);

  /**
   * Set only when sign-out is refused, and it keeps the creator here — carried over verbatim from
   * T077's header control, only the surface it renders in has moved.
   */
  const [signOutError, setSignOutError] = useState<string | null>(null);
  /** Disables the control for the moment before the page swaps, as `login-form.tsx` does on submit. */
  const [signingOut, setSigningOut] = useState(false);

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

  async function signOut(): Promise<void> {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);

    try {
      await logout();
    } catch {
      setSignOutError("Could not sign you out. Your session is still open — try again.");
      setSigningOut(false);
      return;
    }

    // `window.location.replace`, never a router push: the `(app)` guard is a server component and
    // App Router layouts are not re-executed on soft navigations, so a client-side push could land
    // on `/login` with the server never re-reading the now-cleared cookie. `replace` also keeps the
    // signed-in page out of history, where going back would only bounce off the guard.
    window.location.replace("/login");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        // `relative z-[60]`: stays in the header's normal flow (unlike the fixed panel/scrim below)
        // but still out-ranks any `z-50` sheet backdrop that would otherwise cover it — see the
        // docstring's "It has to out-rank z-50" section.
        className="border-hairline bg-surface-2 text-ink-mid focus-ring relative z-[60] h-11 flex-none rounded-sm border px-2.5 text-xs font-semibold tracking-[0.14em] whitespace-nowrap uppercase"
        data-testid="nav-drawer-trigger"
      >
        Menu
      </button>

      {open ? (
        <>
          {/*
           * Its own scrim, stacked above the backlog drawer's (`z-10`/`z-20`) **and** above any open
           * sheet's (`z-50`) — FR-019 forbids either overlay cancelling the other, and a shared scrim
           * click would have to guess which one a tap meant.
           */}
          <div
            className="fixed inset-0 z-[70] bg-black/40"
            aria-hidden="true"
            onClick={() => setOpen(false)}
            data-testid="nav-drawer-scrim"
          />

          <nav
            id={panelId}
            aria-label="Navigation and settings"
            className="border-hairline bg-surface-1 fixed inset-y-0 right-0 z-[80] flex w-[260px] max-w-[80vw] flex-col border-l shadow-e2"
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

            {/*
             * The drawer's far end (T030, FR-017) — a footer below the flex-1 screen list, so it sits
             * at the bottom of the panel whatever that list's length, separated from it by its own
             * rule rather than sitting in the same block.
             */}
            <div className="border-hairline border-t p-4">
              <button
                type="button"
                onClick={() => void signOut()}
                disabled={signingOut}
                className="border-hairline bg-surface-2 text-ink-mid focus-ring h-11 w-full flex-none rounded-sm border text-xs font-semibold tracking-[0.14em] whitespace-nowrap uppercase disabled:opacity-40"
                data-testid="sign-out-action"
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>

              {signOutError === null ? null : (
                <p
                  role="alert"
                  className="text-danger-hi mt-2 text-xs leading-relaxed"
                  data-testid="sign-out-message"
                >
                  {signOutError}
                </p>
              )}
            </div>
          </nav>
        </>
      ) : null}
    </>
  );
}
