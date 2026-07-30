import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes so a later class wins over an earlier conflicting one.
 *
 * Every shadcn primitive imports this. `shadcn init` is supposed to generate it and did not on this
 * machine — it wrote components.json and stopped — so it is checked in by hand rather than left as a
 * broken import in every added component.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
