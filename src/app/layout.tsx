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
export const viewport: Viewport = { viewportFit: "cover", themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={jakarta.variable}>
      <body className="min-h-screen bg-white font-sans text-ink antialiased">
        <Nav />
        <main className="pb-20 md:pb-0">{children}</main>
      </body>
    </html>
  );
}
