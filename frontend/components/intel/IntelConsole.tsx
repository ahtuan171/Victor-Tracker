/* eslint-disable @next/next/no-img-element -- The five images in this file are the mascot: local
   static SVGs of ~3 KB each. `next/image` optimises raster formats and skips SVG entirely unless
   `dangerouslyAllowSVG` is set in next.config, and that flag lets any SVG the pipeline touches
   execute script. Turning it on for three hand-drawn files would buy nothing and widen the attack
   surface, so plain <img> is the right call here and the rule is off for this file only. */
"use client";

import { useEffect, useRef, useState } from "react";

import { NavDrawer } from "@/components/arcade/NavDrawer";

/**
 * TRAVEL INTELLIGENCE — the console surface.
 *
 * Level 1: a conversation and nothing else. It knows nothing about the owner's destinations, and
 * says so when asked, because nothing on this side reads them yet.
 *
 * Conversation state is local and deliberately not persisted: there is no history table behind
 * this, so pretending otherwise across a reload would be a lie the next session has to unpick.
 */

interface Turn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/**
 * The mascot, one file per console state.
 *
 * Artwork comes from `assets/` (the owner's own pixel-art set) and is copied into `public/mascot/`
 * under neutral names. The source names are kept as they are — they are the owner's files — but the
 * product does not carry them: this project renamed itself to Victor Tracker specifically to stay
 * clear of Spider-Man's naming, and a mascot called "spidey" inside the app would undo that.
 *
 * Served from `public/` rather than inlined: three static SVGs of ~3 KB each, cached by the browser,
 * against ~40 `<rect>` elements per file if they were React.
 */
const MASCOT = {
  idle: "/mascot/analyst-idle.svg",
  working: "/mascot/analyst-working.svg",
  error: "/mascot/analyst-error.svg",
} as const;

/** Starter commands. They fill the input rather than sending, so nothing is spent by a stray tap. */
const QUICK_COMMANDS = [
  { label: "PLAN", text: "Plan a 5-day trip in " },
  { label: "RECOMMEND", text: "Recommend three destinations for " },
  { label: "ANALYZE", text: "Analyze this destination for a first visit: " },
] as const;

export function IntelConsole() {
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  async function send() {
    const message = draft.trim();
    if (!message || busy) return;

    const next: readonly Turn[] = [...turns, { role: "user", content: message }];
    setTurns(next);
    setDraft("");
    setError(null);
    setBusy(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const detail =
          payload !== null && typeof payload === "object" && "detail" in payload
            ? String((payload as { detail: unknown }).detail)
            : `The console request failed (${response.status}).`;
        setError(detail);
        return;
      }

      const reply =
        payload !== null && typeof payload === "object" && "reply" in payload
          ? String((payload as { reply: unknown }).reply)
          : "";

      if (!reply) {
        setError("The analyst returned an empty response.");
        return;
      }

      setTurns((current) => [...current, { role: "assistant", content: reply }]);
    } catch {
      setError("Could not reach the console endpoint.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border p-4">
        <h1 className="font-display text-sm tracking-wide">TRAVEL INTELLIGENCE</h1>
        {/* Status and the drawer trigger share the right-hand column, the same shape
            `ScheduleShell` and `MapShell` use: title left, controls right. */}
        <div className="flex items-center gap-3">
          <span
            className="flex items-center gap-2 text-xs text-muted-foreground"
            data-testid="intel-status"
          >
            {/* The mascot replaces the status dot rather than sitting beside it: both said the same
                thing, and two indicators for one state is how they drift apart.

                The word is hidden below `sm` and the mascot carries a real `alt` instead. At 375px
                the header holds a two-line title, the mascot, the word, and the drawer trigger —
                measured, the word ends up underneath the MENU button. Nothing overflows the
                viewport, so a bounding-box audit passes it; the two simply overlap. Dropping the
                word there costs nothing, because the mascot already says the same thing and now
                says it to a screen reader too. */}
            <img
              src={error !== null ? MASCOT.error : busy ? MASCOT.working : MASCOT.idle}
              alt={error !== null ? "Error" : busy ? "Working" : "Online"}
              width={32}
              height={18}
              className={busy ? "animate-pulse" : undefined}
            />
            <span className="hidden sm:inline">{busy ? "WORKING" : "ONLINE"}</span>
          </span>
          <NavDrawer />
        </div>
      </header>

      <div ref={logRef} className="flex-1 space-y-4 overflow-y-auto p-4" data-testid="intel-log">
        {turns.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
            <img src={MASCOT.idle} alt="" width={128} height={72} />
            <p className="font-display text-xs">SYSTEM</p>
            <p className="max-w-sm text-sm">
              Travel Intelligence initialized. Ask about a destination, a route, or a duration.
            </p>
            {/* This line used to say saved destinations were not connected. They are, since the
                context builder landed — leaving it would have been the console telling you it knows
                less than it does. */}
            <p className="max-w-sm text-xs">
              This analyst reads your map: where you have been, what is planned, what is on the
              wishlist. Photographs and personal notes are never sent.
            </p>
          </div>
        )}

        {turns.map((turn, index) => (
          <div key={index} data-testid={`intel-turn-${turn.role}`}>
            <p className="font-display mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              {turn.role === "assistant" && <img src={MASCOT.idle} alt="" width={24} height={14} />}
              {turn.role === "user" ? "COMMAND" : "ANALYST"}
            </p>
            <p
              className={
                turn.role === "user"
                  ? "border-l-2 border-primary pl-3 text-sm"
                  : "text-sm whitespace-pre-wrap"
              }
            >
              {turn.content}
            </p>
          </div>
        ))}

        {busy && (
          <p className="font-display flex items-center gap-1.5 text-xs text-muted-foreground">
            <img src={MASCOT.working} alt="" width={24} height={14} className="animate-pulse" />
            <span className="animate-pulse">ANALYSING...</span>
          </p>
        )}

        {error !== null && (
          <p
            className="flex items-start gap-2 border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
            data-testid="intel-error"
          >
            <img src={MASCOT.error} alt="" width={32} height={18} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <div className="mb-2 flex gap-2 overflow-x-auto">
          {QUICK_COMMANDS.map((command) => (
            <button
              key={command.label}
              type="button"
              onClick={() => {
                setDraft(command.text);
                inputRef.current?.focus();
              }}
              className="focus-ring font-display min-h-[44px] shrink-0 rounded-sm border border-border px-3 text-xs text-muted-foreground hover:text-foreground"
            >
              {command.label}
            </button>
          ))}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="TYPE COMMAND..."
            aria-label="Command"
            data-testid="intel-input"
            className="focus-ring min-h-[44px] flex-1 rounded-sm border border-border bg-secondary px-3 text-sm"
          />
          <button
            type="submit"
            disabled={busy || draft.trim().length === 0}
            data-testid="intel-send"
            className="focus-ring font-display min-h-[44px] min-w-[44px] rounded-sm bg-primary px-4 text-xs text-primary-foreground disabled:opacity-40"
          >
            {busy ? "..." : ">"}
          </button>
        </form>
      </div>
    </div>
  );
}
