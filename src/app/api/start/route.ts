import { NextResponse } from "next/server";
import { WorldError } from "../../../services/errors";
import { loadGameWorld } from "../../../services/world";

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
  try {
    const world = await loadGameWorld(postalCode.trim());
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
