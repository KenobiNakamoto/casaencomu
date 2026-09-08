import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Nav from "@/components/nav";

// ponytail: Airbnb Cereal is proprietary; Plus Jakarta Sans is the closest open face. Self-hosted by next/font.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CasaEnComú",
};

// viewport-fit=cover makes env(safe-area-inset-bottom) non-zero on iPhone (bottom nav)
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0d" },
  ],
};

/**
 * Runs before the first paint, so the resolved theme is on <html> when the CSS is applied and
 * there is no flash of the wrong one. It cannot be a React effect: effects run after paint.
 * `light` and `dark` are the only stored values. Anything else, including nothing at all and the
 * `sistema` an older install may have left, falls back to what the operating system reports —
 * once, on this load, not as a standing subscription. If this script never runs, the
 * `prefers-color-scheme` block in `globals.css` still gives a usable theme.
 * ponytail: four lines inline instead of next-themes. Mirrors `src/lib/theme.ts`, which is where
 * the same rules are stated in TypeScript and tested.
 */
const NO_FLASH = `try{var t=localStorage.getItem("tema");document.documentElement.dataset.theme=(t==="light"||t==="dark")?t:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      <body className="min-h-screen font-sans text-ink antialiased">
        <Nav />
        <main className="pb-[var(--nav-bottom-h)] lg:pb-0">{children}</main>
      </body>
    </html>
  );
}
