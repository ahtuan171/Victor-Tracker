"use client";

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * A native `<input type="date|time">` that opens its picker when tapped anywhere in the field,
 * not only on the small calendar icon — Chromium otherwise drops a tap on the text into the
 * day/month/year segments, which read as "the calendar does nothing" on a phone.
 *
 * `showPicker()` throws in a cross-origin iframe and is missing in older browsers; both cases fall
 * back to the browser's own behaviour.
 */
export function DateInput({
  type = "date",
  className,
  onClick,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { readonly type?: "date" | "time" }) {
  return (
    <input
      type={type}
      onClick={(event) => {
        onClick?.(event);
        try {
          event.currentTarget.showPicker?.();
        } catch {
          // Unsupported here — the native control still works on its own.
        }
      }}
      className={cn(
        "border-hairline bg-surface-3 text-ink focus-ring h-12 w-full rounded-sm border px-3 text-base",
        className,
      )}
      {...props}
    />
  );
}
