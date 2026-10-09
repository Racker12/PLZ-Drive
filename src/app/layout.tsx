import type { Metadata } from "next";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

export const metadata: Metadata = {
  title: "PLZ Drive — Deine Straßen. Deine Fahrt.",
  description:
    "Gib deine deutsche Postleitzahl ein und erkunde echte Straßen mit deinem Auto. Ein kleines Browser-Spiel mit OpenStreetMap.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
