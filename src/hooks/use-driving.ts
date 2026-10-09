"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { selectStartNode } from "../lib/graph";
import type { GameWorld } from "../lib/types";
import {
  advanceVehicle,
  createVehicleState,
  EMPTY_VEHICLE_INPUTS,
  stopVehicle,
  type VehicleInput,
  type VehicleInputs,
  type VehicleState,
} from "../lib/vehicle";

const KEY_INPUTS: Record<string, VehicleInput> = {
  ArrowUp: "throttle",
  KeyW: "throttle",
  ArrowDown: "brake",
  KeyS: "brake",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
};

function isEditing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

export function useDriving(world: GameWorld | null) {
  const [state, setState] = useState<VehicleState | null>(null);
  const [paused, updatePaused] = useState(false);
  const [heldInputs, setHeldInputs] = useState<VehicleInputs>({
    ...EMPTY_VEHICLE_INPUTS,
  });
  const stateRef = useRef<VehicleState | null>(null);
  const worldRef = useRef(world);
  const pausedRef = useRef(false);
  const inputsRef = useRef<VehicleInputs>({ ...EMPTY_VEHICLE_INPUTS });
  const pressedRef = useRef(new Map<string, VehicleInput>());

  const refreshInputs = useCallback(() => {
    const inputs = { ...EMPTY_VEHICLE_INPUTS };
    for (const input of pressedRef.current.values()) inputs[input] = true;
    inputsRef.current = inputs;
    setHeldInputs(inputs);
    const intent: VehicleState["steeringIntent"] =
      inputs.left === inputs.right ? 0 : inputs.left ? -1 : 1;
    const current = stateRef.current;
    if (current && intent !== current.steeringIntent) {
      // A quick release and press can happen between animation frames. Rearm
      // here so the next real junction receives that fresh steering command.
      const rearmed = {
        ...current,
        steeringIntent: intent,
        steeringConsumed: false,
      };
      stateRef.current = rearmed;
      setState(rearmed);
    }
  }, []);

  const stop = useCallback(() => {
    pressedRef.current.clear();
    inputsRef.current = { ...EMPTY_VEHICLE_INPUTS };
    setHeldInputs(inputsRef.current);
    if (stateRef.current) {
      const stopped = stopVehicle(stateRef.current);
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

  const togglePause = useCallback(
    () => setPaused(!pausedRef.current),
    [setPaused],
  );

  const press = useCallback(
    (input: VehicleInput) => {
      if (pausedRef.current) return;
      pressedRef.current.set(`pointer:${input}`, input);
      refreshInputs();
    },
    [refreshInputs],
  );

  const release = useCallback(
    (input: VehicleInput) => {
      pressedRef.current.delete(`pointer:${input}`);
      // Releasing a pedal lets the engine coast rather than instantly stop.
      refreshInputs();
    },
    [refreshInputs],
  );

  const relocate = useCallback(
    (nodeId?: string) => {
      const currentWorld = worldRef.current;
      if (!currentWorld) return;
      const currentNodeId = stateRef.current?.nodeId;
      stop();
      let selected =
        nodeId ?? selectStartNode(currentWorld.graph, currentWorld.center);
      if (!nodeId && selected === currentNodeId) {
        // Exclude the previous location without mutating the immutable world.
        const remaining = {
          ...currentWorld.graph,
          edges: currentWorld.graph.edges.filter(
            (edge) => edge.from !== currentNodeId,
          ),
        };
        if (remaining.edges.length)
          selected = selectStartNode(remaining, currentWorld.center);
      }
      const initial = createVehicleState(currentWorld, selected);
      stateRef.current = initial;
      setState(initial);
    },
    [stop],
  );

  useEffect(() => {
    worldRef.current = world;
    pressedRef.current.clear();
    inputsRef.current = { ...EMPTY_VEHICLE_INPUTS };
    pausedRef.current = false;
    stateRef.current = world ? createVehicleState(world) : null;
    const requestId = requestAnimationFrame(() => {
      updatePaused(pausedRef.current);
      setHeldInputs(inputsRef.current);
      setState(stateRef.current);
    });
    return () => cancelAnimationFrame(requestId);
  }, [world]);

  useEffect(() => {
    if (!world) return;
    let requestId = 0;
    let previousTime: number | null = null;
    const tick = (time: number) => {
      // Bound RAF time so a slow frame or a background tab never teleports.
      const elapsed =
        previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.1);
      previousTime = time;
      const current = stateRef.current;
      if (current && !pausedRef.current) {
        const next = advanceVehicle(
          world.graph,
          current,
          inputsRef.current,
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
      const input = KEY_INPUTS[event.code];
      if (!input) return;
      event.preventDefault();
      if (event.repeat || pausedRef.current) return;
      pressedRef.current.set(event.code, input);
      refreshInputs();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!KEY_INPUTS[event.code]) return;
      pressedRef.current.delete(event.code);
      refreshInputs();
    };
    const onBlur = () => setPaused(true);
    const onVisibilityChange = () => {
      if (document.hidden) setPaused(true);
    };
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
  }, [world, refreshInputs, setPaused, togglePause]);

  return {
    state,
    paused,
    heldInputs,
    togglePause,
    setPaused,
    relocate,
    controls: { press, release, stop },
  };
}
