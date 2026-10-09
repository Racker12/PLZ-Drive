import { NextResponse } from "next/server";
import { WorldError } from "../../../services/errors";
import { loadGameWorld } from "../../../services/world";
import { getSavedBerlinWorld } from "../../../services/saved-world";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Die Anfrage enthält kein gültiges JSON." },
      { status: 400 },
    );
  }
  const postalCode =
    body && typeof body === "object" && "postalCode" in body
      ? (body as { postalCode: unknown }).postalCode
      : undefined;
  if (typeof postalCode !== "string") {
    return NextResponse.json(
      { error: "Bitte gib eine deutsche PLZ mit genau fünf Ziffern ein." },
      { status: 400 },
    );
  }
  const preferSnapshot =
    body && typeof body === "object" && "preferSnapshot" in body
      ? (body as { preferSnapshot: unknown }).preferSnapshot
      : undefined;
  if (preferSnapshot !== undefined && typeof preferSnapshot !== "boolean") {
    return NextResponse.json(
      { error: "Die Demo-Auswahl muss true oder false sein." },
      { status: 400 },
    );
  }
  const normalizedPostalCode = postalCode.trim();
  if (preferSnapshot && normalizedPostalCode !== "10115") {
    return NextResponse.json(
      {
        error:
          "Die Sofort-Demo ist nur für 10115 Berlin verfügbar. Bitte starte andere PLZ mit dem normalen Spielstart.",
      },
      { status: 400 },
    );
  }
  try {
    // A deliberate demo request skips live providers without claiming an outage.
    const world = preferSnapshot
      ? getSavedBerlinWorld("demo")
      : await loadGameWorld(normalizedPostalCode);
    return NextResponse.json(world, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const status = error instanceof WorldError ? error.status : 503;
    const message =
      error instanceof WorldError
        ? error.message
        : "Die Karte konnte nicht geladen werden. Bitte versuche es gleich noch einmal.";
    return NextResponse.json({ error: message }, { status });
  }
}
