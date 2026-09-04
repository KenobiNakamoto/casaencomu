import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CasaEnComú",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-white text-zinc-900 antialiased">
        {/* ponytail: no nav yet — #16 adds it */}
        <main>{children}</main>
      </body>
    </html>
  );
}
