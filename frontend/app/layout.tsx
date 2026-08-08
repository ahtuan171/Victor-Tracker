import type { Metadata } from "next";
import { Barlow, Geist_Mono, Oswald, Silkscreen, VT323 } from "next/font/google";
import "./globals.css";
import { Frame } from "@/components/arcade/Frame";

/**
 * The stage-2 type pairing (design/content-calendar/, panel `1a`).
 *
 * Oswald is condensed and uppercase-led — it carries display and label text only. Barlow is the
 * high-legibility neutral that every piece of *content* is set in. Mixing the two up is the fastest
 * way to make this design illegible at 375px, which is why they are named by role below rather than
 * by typeface.
 *
 * `002-pixel-arcade-skin` replaces both — VT323 for content, Silkscreen for display and labels — but
 * the outgoing pair stays loaded until the token layer and every surface actually switch over
 * (design/002-pixel-arcade-skin/BRIEF.md). `next/font` self-hosts at build time, so no `preconnect`
 * to a Google domain is added here — research R-009 exists to keep that request from ever happening.
 */
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  // Display, section labels, and buttons — 400 through 700 are all used by the export.
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  // Barlow has no variable cut on Google Fonts, so the weights the type scale names are listed.
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const vt323 = VT323({
  // Content face for 002. Ships one weight only (400) — research.md R-001 measured Press Start 2P's
  // 16px advance width as unusable at the 375px floor and VT323 as the narrower, viable alternative.
  variable: "--font-vt323",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

const silkscreen = Silkscreen({
  // Display face for 002 — headings and section labels only, per FR-034. Ships 400 and 700; with
  // VT323 fixed at one weight, hierarchy has to come from size, case, colour and the frame rather
  // than from weight (research.md R-001).
  variable: "--font-silkscreen",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "VictorHub",
  description: "Content calendar for a single creator.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `dark` is set here rather than left to a media query or a toggle: the export's primary
    // direction is the dark one, and v0.1 ships no theme switch. The light counterpart still lives in
    // `globals.css` under `:root`, so turning this into a real preference later is a one-line change
    // and not a re-skin.
    <html
      lang="en"
      className={`dark ${oswald.variable} ${barlow.variable} ${geistMono.variable} ${vt323.variable} ${silkscreen.variable} h-full antialiased`}
    >
      {/*
       * `h-dvh`, not `min-h-full`: this is the one true viewport-height authority now that `Frame`
       * sits between `body` and every route (see `Frame.tsx`'s docstring for the full chain and why
       * a `min-h-*` anywhere in it reproduces `CalendarShell`'s old "action band below the fold" bug.
       */}
      <body className="flex h-dvh flex-col">
        <Frame>{children}</Frame>
      </body>
    </html>
  );
}
