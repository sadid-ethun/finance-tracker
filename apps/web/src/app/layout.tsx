import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";

/**
 * Three voices, per DESIGN_SYSTEM.md: a serif for display figures, a
 * neo-grotesque for UI, a monospace for uppercase labels and data.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Substitute for Lyon Display, which is not freely licensed. Only weight 400
// exists; the reference's whisper-weight 300 is approximated with negative
// tracking at display sizes rather than a lighter cut.
const serif = DM_Serif_Display({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const mono = Roboto_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fintrac",
  description: "Personal finance dashboard",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Fintrac",
    // Matches the canvas so the iOS status bar blends into the page.
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    // iOS ignores the manifest for the Home Screen icon and reads this
    // instead, so it needs its own correctly sized file.
    apple: { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
  // Financial data must never be indexed, even if the URL leaks.
  robots: { index: false, follow: false },
};

// Mobile-first: lock the viewport to device width and tint the browser chrome
// to match the canvas in each colour scheme (PLAN.md section 21).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom off, by request. This is the WCAG 1.4.4 trade-off: it removes
  // the only way to enlarge text for someone who needs it. The 16px input
  // rule in globals.css stays regardless — it is what stops iOS zooming on
  // focus, and that is a separate problem from this one.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // The app is dark regardless of system preference, so the browser chrome
  // is a single value — a light variant here would flash white on launch.
  themeColor: "#0f1011",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${serif.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
