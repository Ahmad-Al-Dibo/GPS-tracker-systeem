// Root layout — GPS Manager light theme
import type { Metadata, Viewport } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: "GPS Manager",
  description: "Professioneel GPS-vlootbeheer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl" className="h-full antialiased">
      <body className="min-h-full bg-[#f8fafc] text-slate-900">{children}</body>
    </html>
  );
}
