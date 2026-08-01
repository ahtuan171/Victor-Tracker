import { type Platform, type Status } from "@/lib/api";

/**
 * How a status and a platform are encoded visually (T038, FR-017, FR-018, SC-004, research.md R-005).
 *
 * This module is the **single definition of the encoding** and holds no geometry. The calendar grid
 * and the backlog drawer both render status and platform (FR-017 covers the backlog explicitly), and
 * `plan.md` names `lib/status.ts` as the one place that mapping lives — it is the project's one
 * abstraction introduced with two callers on day one rather than ahead of them.
 *
 * ## Shape and fill carry the meaning; colour never does
 *
 * SC-004 is written as a test — *"a viewer who cannot distinguish red from green can still identify
 * every item's status"* — so R-005 encodes the pipeline as a progression that survives a greyscale
 * screenshot: **outline → half-filled → solid with a check**. The three hues are present, and they
 * are the design export's, but removing every one of them must leave the three statuses
 * distinguishable. `design/content-calendar/screenshot-month-grid-375-greyscale.png` is the
 * acceptance test that says so, and V3 in [quickstart.md] re-runs it by hand.
 *
 * That is also why `fill` and `check` are **data** here rather than three hard-coded components: a
 * test can assert the progression, and a future fourth cue (there will not be one — FR-007 fixes the
 * pipeline at three) could not be added without deciding where it sits in the order.
 *
 * ## What is deliberately not here
 *
 * - **Size.** The export draws two chips — a micro one for the 50px day cell (8px cue, no title) and
 *   a full one for the week list and the drawer (14px cue, title, monogram badge). Those are
 *   geometry, they belong to the components that render them, and T039/T040 own them.
 * - **Overdue.** It is derived from `scheduled_date` and the *browser's* clock, never the server's
 *   (research.md R-006 addendum), and it is orthogonal to status rather than a fourth value of it —
 *   a dashed left border on the chip, not a cue. **T045** adds it to `ItemChip`, which is the only
 *   place that has both an item and a client render to compute it in.
 * - **Anything that returns JSX.** This file is imported by components and by tests that run with no
 *   renderer at all (`tech-defaults.md` rules out Jest and RTL at v0.1), so it stays pure data.
 */

/** One status's encoding. Everything a cue needs except how big it is. */
export interface StatusCue {
  readonly status: Status;
  /**
   * The accessible name. FR-017 says status is legible "without opening the item", and for a screen
   * reader a shape is nothing at all — the cue carries this as its label, so the visual encoding and
   * the announced one cannot drift apart.
   */
  readonly label: string;
  /**
   * The greyscale-surviving half of the encoding. `outline` is a ring, `half` is a ring filled to the
   * vertical midline, `solid` is a filled disc.
   */
  readonly fill: "outline" | "half" | "solid";
  /** `posted` alone carries a check inside the disc — the end of the pipeline, not a fourth shade. */
  readonly check: boolean;
  /**
   * Tailwind classes naming the status token, never a hex. `app/globals.css` is the only file in this
   * project allowed to contain a colour; these names exist in its `@theme inline` block precisely so
   * a component never re-derives one.
   */
  readonly borderClass: string;
  readonly fillClass: string;
  readonly textClass: string;
}

/**
 * The three statuses in pipeline order, which is also the order of the progression. Keyed by status
 * so a caller cannot index it with a string the contract does not define — `STATUSES` in `lib/api.ts`
 * is checked against `openapi.yaml` by `tests/contract/api-types.spec.ts`, so this record inherits
 * that guarantee through its key type.
 */
export const STATUS_CUES: Readonly<Record<Status, StatusCue>> = {
  idea: {
    status: "idea",
    label: "Idea",
    fill: "outline",
    check: false,
    borderClass: "border-status-idea",
    fillClass: "bg-status-idea",
    textClass: "text-status-idea",
  },
  draft: {
    status: "draft",
    label: "Draft",
    fill: "half",
    check: false,
    borderClass: "border-status-draft",
    fillClass: "bg-status-draft",
    textClass: "text-status-draft",
  },
  posted: {
    status: "posted",
    label: "Posted",
    fill: "solid",
    check: true,
    borderClass: "border-status-posted",
    fillClass: "bg-status-posted",
    textClass: "text-status-posted",
  },
};

/** The pipeline's order, exported so a test can assert the progression rather than restate it. */
export const STATUS_ORDER: readonly Status[] = ["idea", "draft", "posted"];

export function statusCue(status: Status): StatusCue {
  return STATUS_CUES[status];
}

/** One platform's encoding: a letter and a name. */
export interface PlatformCue {
  readonly platform: Platform;
  /**
   * A monogram, not a logo. Brand logos are trademarked assets, need bundling, and are illegible at
   * the 16px this renders at (R-005); a letter is a text node that scales and greys out cleanly.
   */
  readonly monogram: string;
  /** The accessible name — `T` announced as "T" tells a screen-reader user nothing. */
  readonly label: string;
}

export const PLATFORM_CUES: Readonly<Record<Platform, PlatformCue>> = {
  tiktok: { platform: "tiktok", monogram: "T", label: "TikTok" },
  instagram: { platform: "instagram", monogram: "I", label: "Instagram" },
  youtube: { platform: "youtube", monogram: "Y", label: "YouTube" },
};

/**
 * `null` in, `null` out — and that is the whole reason this function exists rather than callers
 * indexing `PLATFORM_CUES` directly. An item with no platform is the **normal** case in this product,
 * not an edge one: FR-005 makes title the only required field and the Platform-is-optional-until-it-
 * matters assumption keeps an idea platformless indefinitely. Every surface therefore has to render
 * "no platform" as a first-class state, and a lookup that throws or yields `undefined` would push
 * that decision into each of them.
 */
export function platformCue(platform: Platform | null): PlatformCue | null {
  return platform === null ? null : PLATFORM_CUES[platform];
}
