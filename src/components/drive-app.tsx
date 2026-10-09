"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowIcon, CarIcon, CompassIcon, PinIcon } from "./icons";
import { RoutePreview } from "./route-preview";
import { GameView } from "./game-view";
import type { GameWorld } from "@/lib/types";

export function DriveApp() {
  const [postalCode, setPostalCode] = useState("");
  const [world, setWorld] = useState<GameWorld | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);

  async function start(event: FormEvent) {
    event.preventDefault();
    const value = postalCode.trim();
    if (!/^\d{5}$/.test(value)) {
      setError("Bitte gib eine deutsche Postleitzahl mit genau 5 Ziffern ein.");
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postalCode: value }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "Der Start konnte nicht vorbereitet werden.",
        );
      setWorld(data as GameWorld);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Keine Verbindung. Bitte versuche es noch einmal.",
        );
      }
    } finally {
      if (requestRef.current === controller) setLoading(false);
    }
  }

  if (world) return <GameView world={world} onExit={() => setWorld(null)} />;

  return (
    <main className="landing">
      <header className="site-header">
        <Link href="/" className="brand" aria-label="PLZ Drive Startseite">
          <span className="brand-mark">
            <CarIcon />
          </span>
          <span>
            PLZ<span className="brand-light">DRIVE</span>
            <span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="header-note">
          <span className="live-dot" /> DEINE STADT. DEIN SPIEL.
        </div>
        <span className="version-badge">MVP / 01</span>
      </header>
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow">
            <span className="eyebrow-line" /> FREE DRIVE · MADE FOR EXPLORING
          </div>
          <h1>
            Deine PLZ.
            <br />
            <span>Deine Straßen.</span>
          </h1>
          <p className="hero-description">
            Vom eigenen Viertel bis ans andere Ende der Stadt.
            <br className="desktop-break" /> Steig ein und entdecke echte
            Straßen — direkt im Browser.
          </p>
          <form className="start-form" onSubmit={start} noValidate>
            <label htmlFor="postal-code">WO SOLL DEINE FAHRT BEGINNEN?</label>
            <div className={`input-shell ${error ? "input-error" : ""}`}>
              <PinIcon />
              <input
                id="postal-code"
                name="postal-code"
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={5}
                placeholder="Deine Postleitzahl"
                value={postalCode}
                onChange={(e) => {
                  setPostalCode(e.target.value.replace(/[^0-9]/g, ""));
                  setError("");
                }}
                aria-describedby={error ? "start-error" : "postal-hint"}
                aria-invalid={Boolean(error)}
                disabled={loading}
              />
              <span className="country-tag">DE</span>
            </div>
            <button className="start-button" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" /> Straßen werden vorbereitet …
                </>
              ) : (
                <>
                  Spiel starten <ArrowIcon />
                </>
              )}
            </button>
            {error && (
              <p id="start-error" className="error-message" role="alert">
                {error}
              </p>
            )}
            <p id="postal-hint" className="form-hint">
              {loading ? (
                "Wir suchen deinen Ort und laden das Straßennetz. Das kann einen Moment dauern."
              ) : (
                <>
                  5 Ziffern. Unendlich viel zu entdecken.
                  <br />
                  <span>Zum Beispiel </span>
                  <button
                    type="button"
                    className="example-button"
                    onClick={() => {
                      setPostalCode("10115");
                      setError("");
                    }}
                  >
                    10115 · Berlin
                  </button>
                </>
              )}
            </p>
          </form>
          <div className="hero-features">
            <div>
              <CompassIcon />
              <span>
                Echte Straßen<small>OpenStreetMap</small>
              </span>
            </div>
            <div>
              <CarIcon />
              <span>
                Einfach fahren<small>WASD oder Pfeiltasten</small>
              </span>
            </div>
          </div>
        </div>
        <RoutePreview />
      </section>
      <section className="how-it-works" aria-label="So funktioniert PLZ Drive">
        <div className="how-title">
          KEIN ZIEL.
          <br />
          <span>NUR DEIN WEG.</span>
        </div>
        <div className="how-step">
          <span className="step-number">01</span>
          <div>
            <h2>Deinen Ort wählen</h2>
            <p>Eine deutsche PLZ ist dein Startpunkt.</p>
          </div>
        </div>
        <div className="how-step">
          <span className="step-number">02</span>
          <div>
            <h2>Einsteigen & losfahren</h2>
            <p>Mit den Tasten durch echte Straßen.</p>
          </div>
        </div>
        <div className="how-step">
          <span className="step-number">03</span>
          <div>
            <h2>Neues entdecken</h2>
            <p>An jeder Kreuzung ein anderer Weg.</p>
          </div>
        </div>
      </section>
      <footer className="site-footer">
        <span>
          PLZ DRIVE <span className="footer-dash">/</span> Ein kleines Spiel für
          große Entdecker.
        </span>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          Kartendaten © OpenStreetMap-Mitwirkende <ArrowIcon />
        </a>
      </footer>
    </main>
  );
}
