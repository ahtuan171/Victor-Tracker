import type { Metadata } from "next";
import { Barlow, Geist_Mono, Oswald } from "next/font/google";
import "./globals.css";

/**
 * The stage-2 type pairing (design/content-calendar/, panel `1a`).
 *
 * Oswald is condensed and uppercase-led — it carries display and label text only. Barlow is the
 * high-legibility neutral that every piece of *content* is set in. Mixing the two up is the fastest
 * way to make this design illegible at 375px, which is why they are named by role below rather than
 * by typeface.
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
      className={`dark ${oswald.variable} ${barlow.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
