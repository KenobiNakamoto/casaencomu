import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/nav";

export const metadata: Metadata = {
  title: "CasaEnComú",
};

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
