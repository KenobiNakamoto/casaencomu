import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/nav";

export const metadata: Metadata = {
  title: "CasaEnComú",
};

// viewport-fit=cover makes env(safe-area-inset-bottom) non-zero on iPhone (bottom nav)
export const viewport: Viewport = { viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-white text-zinc-900 antialiased">
        <Nav />
        <main className="pb-16 md:pb-0">{children}</main>
      </body>
    </html>
  );
}
