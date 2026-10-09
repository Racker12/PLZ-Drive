"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { GameWorld } from "@/lib/types";
import type { VehicleInput } from "@/lib/vehicle";
import { useDriving } from "@/hooks/use-driving";
import {
  ArrowIcon,
  CarIcon,
  CompassIcon,
  PauseIcon,
  PinIcon,
  RefreshIcon,
} from "./icons";

const RoadScene = dynamic(
  () => import("./road-scene").then((module) => module.RoadScene),
  {
    ssr: false,
    loading: () => (
      <div className="map-loading">
        <span className="spinner" /> Deine Straßen nehmen Form an …
      </div>
    ),
  },
);
const RoadMap = dynamic(
  () => import("./road-map").then((module) => module.RoadMap),
  { ssr: false },
);

export function GameView({
  world,
  onExit,
}: {
  world: GameWorld;
  onExit: () => void;
}) {
  const driving = useDriving(world);
  const [cameraMode, setCameraMode] = useState<"chase" | "hood">("chase");
  const [sceneError, setSceneError] = useState("");
  const [showHelp, setShowHelp] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const state = driving.state;
  const onSceneError = useCallback(
    (message: string) => setSceneError(message),
    [],
  );
  const changeCamera = useCallback(
    () => setCameraMode((mode) => (mode === "chase" ? "hood" : "chase")),
    [],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.code === "KeyC" &&
        !event.repeat &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        changeCamera();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changeCamera]);

  function controlButton(
    input: VehicleInput,
    position: string,
    label: string,
    key: string,
    arrow: string,
  ) {
    return (
      <button
        type="button"
        className={`direction-button direction-${position} ${driving.heldInputs[input] ? "pressed" : ""}`}
        aria-label={label}
        title={label}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          driving.controls.press(input);
        }}
        onPointerUp={() => driving.controls.release(input)}
        onPointerCancel={() => driving.controls.release(input)}
        onLostPointerCapture={() => driving.controls.release(input)}
      >
        <span>{key}</span>
        <small>{arrow}</small>
      </button>
    );
  }

  return (
    <main
      className="game-screen game-3d"
      data-view={sceneError ? "map" : "3d"}
      data-camera={cameraMode}
    >
      {state &&
        (sceneError ? (
          <RoadMap
            world={world}
            coordinate={state.coordinate}
            bearing={state.bearing}
            follow
          />
        ) : (
          <RoadScene
            world={world}
            coordinate={state.coordinate}
            bearing={state.bearing}
            speedKmh={state.velocityKmh}
            distanceMeters={state.distanceMeters}
            steering={state.steering}
            cameraMode={cameraMode}
            onError={onSceneError}
          />
        ))}
      <div className="scene-vignette" aria-hidden="true" />
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
          <span className="session-separator">/</span>{" "}
          {sceneError ? "KARTE" : "3D"}{" "}
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
          onClick={() => driving.relocate()}
        >
          <RefreshIcon /> Neuen Startpunkt wählen
        </button>
        <button
          className="area-info-button"
          type="button"
          aria-expanded={showInfo}
          onClick={() => setShowInfo((value) => !value)}
        >
          {world.fallback ? "Gespeichertes OSM-Netz" : "Echte OSM-Straßen"}
          <span>i</span>
        </button>
      </aside>
      {showInfo && world.notice && (
        <div className="world-notice" role="status">
          {world.notice}
          <br />
          <span>Gebäude und Landschaft sind eine stilisierte 3D-Kulisse.</span>
        </div>
      )}
      {sceneError && (
        <div className="scene-error" role="status">
          {sceneError} Du kannst in der Kartenansicht weiterfahren.
        </div>
      )}
      <div className="map-actions">
        <button
          className="map-action active"
          type="button"
          aria-label="Kamera wechseln"
          title="Kamera wechseln · C"
          onClick={changeCamera}
          disabled={Boolean(sceneError)}
        >
          <CompassIcon />
          <span className="camera-key">C</span>
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
      {!sceneError && (
        <div className="camera-label">
          {cameraMode === "chase" ? "VERFOLGERKAMERA" : "HAUBENKAMERA"}
        </div>
      )}
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
            ? state.edgeId
              ? "Rückwärtsfahrt hier nicht erlaubt. W / ↑ zum Weiterfahren."
              : "Sackgasse oder Netzrand. Fahre zurück oder wähle einen neuen Startpunkt."
            : state?.steeringConsumed &&
                (driving.heldInputs.left || driving.heldInputs.right)
              ? "Für den nächsten Abzweig A / D kurz loslassen."
              : driving.heldInputs.left
                ? "An der nächsten Abzweigung links."
                : driving.heldInputs.right
                  ? "An der nächsten Abzweigung rechts."
                  : (state?.speedKmh ?? 0) > 1
                    ? "GUTE FAHRT"
                    : "W / ↑ zum Losfahren. A / D zum Abbiegen."}
      </div>
      <div className="game-bottom">
        <section className="controls-card" aria-label="Steuerung">
          <button
            type="button"
            className="controls-title"
            onClick={() => setShowHelp((value) => !value)}
            aria-expanded={showHelp}
          >
            DEINE STRASSEN. DEINE FAHRT.<span>{showHelp ? "−" : "+"}</span>
          </button>
          {showHelp && (
            <>
              <div className="controls-content">
                <div className="direction-pad">
                  {controlButton("throttle", "north", "Gas geben", "W", "↑")}
                  {controlButton("left", "west", "Links abbiegen", "A", "←")}
                  {controlButton(
                    "brake",
                    "south",
                    "Bremsen und rückwärts fahren",
                    "S",
                    "↓",
                  )}
                  {controlButton("right", "east", "Rechts abbiegen", "D", "→")}
                </div>
                <p>
                  <strong>W</strong> Gas · <strong>S</strong> Bremse / zurück
                  <br />
                  <strong>A / D</strong> an Abzweigungen lenken
                  <br />
                  <span>Alternativ: Pfeiltasten oder Touch.</span>
                </p>
              </div>
              <div className="controls-footer">
                <span>C = KAMERA</span>
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
          <div className="gear" aria-label={`Gang ${state?.gear ?? "N"}`}>
            {state?.gear ?? "N"}
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
      <div className="scene-attribution">
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap-Mitwirkende
        </a>
        <span> · STILISIERTE 3D-UMGEBUNG</span>
      </div>
    </main>
  );
}
