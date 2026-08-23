import { cookies } from "next/headers";
import type { Metadata } from "next";
import { Barlow, Geist_Mono, Oswald, Silkscreen, VT323 } from "next/font/google";
import "./globals.css";
import { Frame } from "@/components/arcade/Frame";
import { THEME_COOKIE_NAME, parseTheme } from "@/lib/theme";

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
  title: "Victor Tracker",
  // Was "Content calendar for a single creator." — that surface was removed when Travel Schedule
  // replaced it, so the description outlived the thing it described.
  description: "A personal travel map: places visited, places planned, places wanted.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // T033, research.md R-002: read the account's last-known presentation from the `ch_theme` cookie
  // *before* the document is written, so FR-013 ("no flash, not even one frame") holds without any
  // blocking inline script. `parseTheme` refuses anything but exactly "dark"/"light", so an absent,
  // empty, or stale cookie value falls through to the FR-012 default below rather than becoming a
  // silent third presentation.
  const store = await cookies();
  const theme = parseTheme(store.get(THEME_COOKIE_NAME)?.value);

  // Dark unless the cookie says otherwise (FR-012). Light is the *absence* of this class — `:root`
  // already carries the light values in `globals.css` — so there is no second class to add.
  const themeClass = theme === "light" ? "" : "dark";

  return (
    <html
      lang="en"
      className={`${themeClass} ${oswald.variable} ${barlow.variable} ${geistMono.variable} ${vt323.variable} ${silkscreen.variable} h-full antialiased`}
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
