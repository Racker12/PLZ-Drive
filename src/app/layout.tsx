import type { Metadata } from "next";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

export const metadata: Metadata = {
  title: "PLZ Drive 3D — Deine Straßen. Deine Fahrt.",
  description:
    "Gib deine deutsche Postleitzahl ein und erkunde echte Straßen mit deinem Auto. Ein 3D-Browser-Spiel mit echten OpenStreetMap-Straßen.",
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
