"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceDriving,
  createDrivingState,
  drivableNodeIds,
  type DrivingDirection,
  type DrivingState,
} from "../lib/driving";
import type { GameWorld } from "../lib/types";

const KEY_DIRECTIONS: Record<string, DrivingDirection> = {
  ArrowUp: "north",
  KeyW: "north",
  ArrowRight: "east",
  KeyD: "east",
  ArrowDown: "south",
  KeyS: "south",
  ArrowLeft: "west",
  KeyA: "west",
};

function isEditing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

export function useDriving(world: GameWorld | null) {
  const [state, setState] = useState<DrivingState | null>(null);
  const [paused, updatePaused] = useState(false);
  const [heldDirection, setHeldDirection] = useState<DrivingDirection | null>(
    null,
  );
  const stateRef = useRef<DrivingState | null>(null);
  const worldRef = useRef(world);
  const pausedRef = useRef(false);
  const directionRef = useRef<DrivingDirection | null>(null);
  const pressedRef = useRef(new Map<string, DrivingDirection>());

  const refreshDirection = useCallback(() => {
    const pressed = [...pressedRef.current.values()];
    const direction = pressed.at(-1) ?? null;
    directionRef.current = direction;
    setHeldDirection(direction);
  }, []);

  const stop = useCallback(() => {
    pressedRef.current.clear();
    directionRef.current = null;
    setHeldDirection(null);
    if (stateRef.current) {
      const stopped = { ...stateRef.current, running: false, speedKmh: 0 };
      stateRef.current = stopped;
      setState(stopped);
    }
  }, []);

  const setPaused = useCallback(
    (value: boolean) => {
      pausedRef.current = value;
      updatePaused(value);
      stop();
    },
    [stop],
  );

  const togglePause = useCallback(() => {
    setPaused(!pausedRef.current);
  }, [setPaused]);

  const press = useCallback(
    (direction: DrivingDirection) => {
      pressedRef.current.set(`pointer:${direction}`, direction);
      refreshDirection();
    },
    [refreshDirection],
  );

  const release = useCallback(
    (direction: DrivingDirection) => {
      pressedRef.current.delete(`pointer:${direction}`);
      refreshDirection();
    },
    [refreshDirection],
  );

  const relocate = useCallback(
    (nodeId?: string) => {
      const currentWorld = worldRef.current;
      if (!currentWorld) return;
      stop();
      const candidates = drivableNodeIds(currentWorld.graph).filter(
        (id) => id !== stateRef.current?.nodeId,
      );
      const selected =
        nodeId ??
        candidates[Math.floor(Math.random() * candidates.length)] ??
        currentWorld.startNodeId;
      const initial = createDrivingState(currentWorld, selected);
      stateRef.current = initial;
      setState(initial);
    },
    [stop],
  );

  useEffect(() => {
    worldRef.current = world;
    pressedRef.current.clear();
    directionRef.current = null;
    pausedRef.current = false;
    const initial = world ? createDrivingState(world) : null;
    stateRef.current = initial;
    // Publish the new animation snapshot on its frame, not during effect setup.
    const requestId = requestAnimationFrame(() => {
      updatePaused(pausedRef.current);
      setHeldDirection(directionRef.current);
      setState(stateRef.current);
    });
    return () => cancelAnimationFrame(requestId);
  }, [world]);

  useEffect(() => {
    if (!world) return;
    let requestId = 0;
    let previousTime: number | null = null;

    const tick = (time: number) => {
      // Bound elapsed time so resuming a background tab never jumps the car.
      const elapsed =
        previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.1);
      previousTime = time;
      const current = stateRef.current;
      if (current) {
        const next = advanceDriving(
          world.graph,
          current,
          pausedRef.current ? null : directionRef.current,
          elapsed,
        );
        if (next !== current) {
          stateRef.current = next;
          setState(next);
        }
      }
      requestId = requestAnimationFrame(tick);
    };

    requestId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(requestId);
  }, [world]);

  useEffect(() => {
    if (!world) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        isEditing(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (event.code === "Space" || event.code === "KeyP") {
        event.preventDefault();
        if (!event.repeat) togglePause();
        return;
      }
      const direction = KEY_DIRECTIONS[event.code];
      if (!direction) return;
      event.preventDefault();
      if (event.repeat) return;
      pressedRef.current.set(event.code, direction);
      refreshDirection();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!KEY_DIRECTIONS[event.code]) return;
      pressedRef.current.delete(event.code);
      refreshDirection();
    };

    const onBlur = () => setPaused(true);
    const onVisibilityChange = () => {
      if (document.hidden) setPaused(true);
    };
    // Focusing a form must immediately release previously held driving keys.
    const onFocus = (event: FocusEvent) => {
      if (isEditing(event.target)) setPaused(true);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("focusin", onFocus);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("focusin", onFocus);
    };
  }, [world, refreshDirection, setPaused, stop, togglePause]);

  return {
    state,
    paused,
    heldDirection,
    togglePause,
    setPaused,
    relocate,
    controls: { press, release, stop },
  };
}
