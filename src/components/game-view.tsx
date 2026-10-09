"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { GameWorld } from "@/lib/types";
import type { DrivingDirection } from "@/lib/driving";
import { useDriving } from "@/hooks/use-driving";
import {
  ArrowIcon,
  CarIcon,
  CompassIcon,
  PauseIcon,
  PinIcon,
  RefreshIcon,
} from "./icons";

const RoadMap = dynamic(
  () => import("./road-map").then((module) => module.RoadMap),
  {
    ssr: false,
    loading: () => (
      <div className="map-loading">
        <span className="spinner" /> Karte wird gestartet …
      </div>
    ),
  },
);

export function GameView({
  world,
  onExit,
}: {
  world: GameWorld;
  onExit: () => void;
}) {
  const driving = useDriving(world);
  const [follow, setFollow] = useState(true);
  const [showHelp, setShowHelp] = useState(true);
  const state = driving.state;

  const directionButton = (
    direction: DrivingDirection,
    label: string,
    symbol: string,
  ) => (
    <button
      type="button"
      className={`direction-button direction-${direction} ${driving.heldDirection === direction ? "pressed" : ""}`}
      aria-label={`Nach ${label} fahren`}
      title={`Nach ${label} fahren`}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        driving.controls.press(direction);
      }}
      onPointerUp={() => driving.controls.release(direction)}
      onPointerCancel={() => driving.controls.release(direction)}
      onLostPointerCapture={() => driving.controls.release(direction)}
    >
      {symbol}
    </button>
  );

  return (
    <main className="game-screen">
      {state && (
        <RoadMap
          world={world}
          coordinate={state.coordinate}
          bearing={state.bearing}
          follow={follow}
        />
      )}
      <header className="game-header">
        <button
          className="brand game-brand"
          type="button"
          onClick={onExit}
          title="Zur Startseite"
        >
          <span className="brand-mark">
            <CarIcon />
          </span>
          <span>
            PLZ<span className="brand-light">DRIVE</span>
            <span className="brand-dot">.</span>
          </span>
        </button>
        <div className="game-session">
          <span className="live-dot" /> FREE DRIVE{" "}
          <span className="session-separator">/</span> {world.postalCode}
        </div>
        <button
          className="small-button exit-button"
          type="button"
          onClick={onExit}
        >
          <ArrowIcon /> Andere PLZ
        </button>
      </header>
      <aside className="location-card">
        <div className="location-eyebrow">
          <PinIcon /> DEIN STARTGEBIET
        </div>
        <h1>{world.place}</h1>
        <p>
          {world.postalCode} <span>·</span> {world.state || "Deutschland"}
        </p>
        <div className="location-coordinates">
          {state?.coordinate[1].toFixed(5)}° N <span>/</span>{" "}
          {state?.coordinate[0].toFixed(5)}° E
        </div>
        <button
          className="text-button"
          type="button"
          onClick={() => {
            driving.relocate();
            setFollow(true);
          }}
        >
          <RefreshIcon /> Neuen Startpunkt wählen
        </button>
        <p className="area-note">
          Freie Fahrt im geladenen Straßennetz rund um deinen Start.
        </p>
      </aside>
      {world.notice && (
        <div className="world-notice" role="status">
          {world.notice}
        </div>
      )}
      <div className="map-actions">
        <button
          className={`map-action ${follow ? "active" : ""}`}
          type="button"
          aria-label={
            follow
              ? "Karte folgt dem Auto – ausschalten"
              : "Karte auf Auto zentrieren"
          }
          title="Auto folgen"
          aria-pressed={follow}
          onClick={() => setFollow((value) => !value)}
        >
          <CompassIcon />
        </button>
        <button
          className="map-action"
          type="button"
          aria-label={driving.paused ? "Fahrt fortsetzen" : "Fahrt pausieren"}
          title="Pause · Leertaste"
          onClick={driving.togglePause}
        >
          <PauseIcon paused={driving.paused} />
        </button>
      </div>
      {driving.paused && (
        <div className="pause-overlay">
          <PauseIcon paused={false} />
          <h2>Kurze Pause.</h2>
          <p>Deine Straßen warten auf dich.</p>
          <button
            className="start-button"
            type="button"
            onClick={driving.togglePause}
          >
            Weiterfahren <ArrowIcon />
          </button>
        </div>
      )}
      <div className="driving-status" role="status">
        {driving.paused
          ? "PAUSIERT"
          : state?.atBoundary
            ? "Sackgasse oder Netzrand. Wähle eine andere Richtung oder einen neuen Startpunkt."
            : driving.heldDirection
              ? "GUTE FAHRT"
              : "Halte WASD oder eine Pfeiltaste zum Fahren."}
      </div>
      <div className="game-bottom">
        <section className="controls-card" aria-label="Steuerung">
          <button
            type="button"
            className="controls-title"
            onClick={() => setShowHelp((value) => !value)}
            aria-expanded={showHelp}
          >
            DEIN WEG, DEINE RICHTUNG <span>{showHelp ? "−" : "+"}</span>
          </button>
          {showHelp && (
            <>
              <div className="controls-content">
                <div className="direction-pad">
                  {directionButton("north", "Norden", "↑")}
                  {directionButton("west", "Westen", "←")}
                  {directionButton("south", "Süden", "↓")}
                  {directionButton("east", "Osten", "→")}
                </div>
                <p>
                  <strong>WASD</strong> oder <strong>Pfeiltasten</strong>
                  <br />
                  Taste halten, um zu fahren.
                  <br />
                  <span>Nächste Kreuzung: neue Richtung.</span>
                </p>
              </div>
              <div className="controls-footer">
                <span>N ↑ &nbsp; E → &nbsp; S ↓ &nbsp; W ←</span>
                <span>LEERTASTE = PAUSE</span>
              </div>
            </>
          )}
        </section>
        <section className="dashboard" aria-label="Fahrtinformationen">
          <div className="speed">
            <strong>
              {Math.round(state?.speedKmh ?? 0)
                .toString()
                .padStart(2, "0")}
            </strong>
            <span>KM/H</span>
          </div>
          <div className="dashboard-divider" />
          <div className="trip">
            <span>DEINE FAHRT</span>
            <strong>
              {((state?.distanceMeters ?? 0) / 1000).toFixed(2)}{" "}
              <small>km</small>
            </strong>
            <p>{state?.roadName || "Bereit zum Losfahren"}</p>
          </div>
          <div className="dashboard-car">
            <CarIcon />
            <span className="live-dot" />
          </div>
        </section>
      </div>
    </main>
  );
}
