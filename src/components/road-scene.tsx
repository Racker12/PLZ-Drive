"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  createSceneWorld,
  projectCoordinate,
  type SceneWorld,
  type WorldPoint,
} from "@/lib/scene-world";
import type { Coordinate, GameWorld } from "@/lib/types";

type RoadSceneProps = {
  world: GameWorld;
  coordinate: Coordinate;
  bearing: number;
  speedKmh: number;
  distanceMeters: number;
  steering: number;
  cameraMode: "chase" | "hood";
  onError: (message: string) => void;
};

const ROAD_HALF_WIDTH = 3.8;
const ROAD_HEIGHT = 0.04;

function addQuad(
  positions: number[],
  a: WorldPoint,
  b: WorldPoint,
  offsetA: WorldPoint,
  offsetB: WorldPoint,
  height: number,
) {
  const leftA = [a.x + offsetA.x, height, a.z + offsetA.z];
  const rightA = [a.x - offsetA.x, height, a.z - offsetA.z];
  const leftB = [b.x + offsetB.x, height, b.z + offsetB.z];
  const rightB = [b.x - offsetB.x, height, b.z - offsetB.z];
  positions.push(...leftA, ...leftB, ...rightA, ...rightA, ...leftB, ...rightB);
}

function geometryFrom(positions: number[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function addDisc(
  positions: number[],
  point: WorldPoint,
  radius: number,
  height: number,
) {
  for (let index = 0; index < 12; index += 1) {
    const a = (index / 12) * Math.PI * 2;
    const b = ((index + 1) / 12) * Math.PI * 2;
    positions.push(
      point.x,
      height,
      point.z,
      point.x + Math.cos(b) * radius,
      height,
      point.z + Math.sin(b) * radius,
      point.x + Math.cos(a) * radius,
      height,
      point.z + Math.sin(a) * radius,
    );
  }
}

/** Joined ribbons retain the real OSM bends; reverse graph edges render only once. */
function makeRoads(world: SceneWorld) {
  const asphalt: number[] = [];
  const sidewalks: number[] = [];
  const markings: number[] = [];
  for (const road of world.roads) {
    const points = road.points;
    const normals = points.map((point, index) => {
      const before = points[Math.max(0, index - 1)];
      const after = points[Math.min(points.length - 1, index + 1)];
      const dx = after.x - before.x;
      const dz = after.z - before.z;
      const length = Math.max(Math.hypot(dx, dz), 0.001);
      return { x: -dz / length, z: dx / length };
    });
    let traveled = 0;
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1];
      const b = points[index];
      const offsetA = normals[index - 1];
      const offsetB = normals[index];
      addQuad(
        sidewalks,
        a,
        b,
        { x: offsetA.x * 5.3, z: offsetA.z * 5.3 },
        { x: offsetB.x * 5.3, z: offsetB.z * 5.3 },
        0.012,
      );
      addQuad(
        asphalt,
        a,
        b,
        { x: offsetA.x * ROAD_HALF_WIDTH, z: offsetA.z * ROAD_HALF_WIDTH },
        { x: offsetB.x * ROAD_HALF_WIDTH, z: offsetB.z * ROAD_HALF_WIDTH },
        ROAD_HEIGHT,
      );
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.1) continue;
      const dx = (b.x - a.x) / length;
      const dz = (b.z - a.z) / length;
      // Small lane dashes are geometry rather than textures or external assets.
      for (
        let dash = Math.ceil(traveled / 12) * 12;
        dash < traveled + length;
        dash += 12
      ) {
        const start = Math.max(0, dash - traveled);
        const end = Math.min(length, start + 4);
        if (end - start < 0.2) continue;
        addQuad(
          markings,
          { x: a.x + dx * start, z: a.z + dz * start },
          { x: a.x + dx * end, z: a.z + dz * end },
          { x: -dz * 0.075, z: dx * 0.075 },
          { x: -dz * 0.075, z: dx * 0.075 },
          ROAD_HEIGHT + 0.015,
        );
      }
      traveled += length;
    }
  }
  for (const junction of world.junctions) {
    addDisc(sidewalks, junction, 5.3, 0.012);
    addDisc(asphalt, junction, ROAD_HALF_WIDTH, ROAD_HEIGHT);
  }
  const group = new THREE.Group();
  const roadGeometry = geometryFrom(asphalt);
  const road = new THREE.Mesh(
    roadGeometry,
    new THREE.MeshStandardMaterial({ color: "#343c42", roughness: 0.95 }),
  );
  road.receiveShadow = true;
  group.add(road);
  const sidewalk = new THREE.Mesh(
    geometryFrom(sidewalks),
    new THREE.MeshStandardMaterial({ color: "#a1a397", roughness: 1 }),
  );
  sidewalk.receiveShadow = true;
  group.add(sidewalk);
  group.add(
    new THREE.Mesh(
      geometryFrom(markings),
      new THREE.MeshStandardMaterial({ color: "#e4e3cc", roughness: 1 }),
    ),
  );
  return { group, roadGeometry };
}

/** The neighborhood is illustrative scenery, never claimed to be OSM buildings. */
function makeScenery(world: SceneWorld) {
  const group = new THREE.Group();
  const count = world.buildings.length;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const walls = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: "white", roughness: 0.85 }),
    count,
  );
  const roofs = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: "#697679", roughness: 0.9 }),
    count,
  );
  const windowCount = world.buildings.reduce(
    (sum, building) =>
      sum + Math.max(1, Math.floor((building.height - 2) / 3.1)) * 2,
    0,
  );
  const windows = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: "#365462",
      roughness: 0.3,
      metalness: 0.25,
      emissive: "#94b4c0",
      emissiveIntensity: 0.08,
    }),
    windowCount,
  );
  const colors = [
    "#ddd2bd",
    "#b5bec1",
    "#d6ddce",
    "#c59079",
    "#98aabc",
    "#acbda5",
  ];
  const dummy = new THREE.Object3D();
  let windowIndex = 0;
  world.buildings.forEach((building, index) => {
    dummy.position.set(building.x, building.height / 2, building.z);
    dummy.rotation.set(0, building.rotation, 0);
    dummy.scale.set(building.width, building.height, building.depth);
    dummy.updateMatrix();
    walls.setMatrixAt(index, dummy.matrix);
    walls.setColorAt(index, new THREE.Color(colors[building.color]));
    dummy.position.y = building.height + 0.15;
    dummy.scale.set(building.width + 0.7, 0.3, building.depth + 0.7);
    dummy.updateMatrix();
    roofs.setMatrixAt(index, dummy.matrix);
    const floors = Math.max(1, Math.floor((building.height - 2) / 3.1));
    for (let floor = 0; floor < floors; floor += 1) {
      for (const side of [-1, 1]) {
        const offset = side * (building.depth / 2 + 0.025);
        dummy.position.set(
          building.x + Math.sin(building.rotation) * offset,
          2.4 + floor * 3.1,
          building.z + Math.cos(building.rotation) * offset,
        );
        dummy.scale.set(building.width * 0.72, 0.95, 0.045);
        dummy.updateMatrix();
        windows.setMatrixAt(windowIndex++, dummy.matrix);
      }
    }
  });
  walls.castShadow = true;
  walls.receiveShadow = true;
  roofs.castShadow = true;
  group.add(walls, roofs, windows);

  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.18, 0.24, 1, 5),
    new THREE.MeshStandardMaterial({ color: "#74634a", roughness: 1 }),
    world.trees.length,
  );
  const crowns = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({
      color: "white",
      roughness: 1,
      flatShading: true,
    }),
    world.trees.length,
  );
  world.trees.forEach((tree, index) => {
    dummy.position.set(tree.x, tree.height * 0.23, tree.z);
    dummy.rotation.set(0, index * 0.7, 0);
    dummy.scale.set(1, tree.height * 0.46, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(index, dummy.matrix);
    dummy.position.y = tree.height * 0.67;
    dummy.scale.set(tree.scale, tree.height * 0.4, tree.scale);
    dummy.updateMatrix();
    crowns.setMatrixAt(index, dummy.matrix);
    crowns.setColorAt(
      index,
      new THREE.Color(
        index % 3 === 0 ? "#607e5a" : index % 3 === 1 ? "#789665" : "#537b62",
      ),
    );
  });
  crowns.castShadow = true;
  group.add(trunks, crowns);
  return group;
}

function makeCar() {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({
    color: "#d3ee79",
    roughness: 0.33,
    metalness: 0.35,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: "#18252c",
    roughness: 0.7,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: "#234555",
    roughness: 0.18,
    metalness: 0.55,
  });
  const headlight = new THREE.MeshStandardMaterial({
    color: "#fff9dd",
    emissive: "#fff6c4",
    emissiveIntensity: 1.1,
  });
  const taillight = new THREE.MeshStandardMaterial({
    color: "#e76049",
    emissive: "#ff4422",
    emissiveIntensity: 0.45,
  });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const part = (
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    length: number,
    material: THREE.Material,
  ) => {
    const mesh = new THREE.Mesh(box, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  part(0, 0.46, 0, 1.86, 0.49, 4.1, body);
  part(0, 0.29, 0, 1.88, 0.16, 4.14, trim);
  part(0, 0.77, -1.23, 1.77, 0.15, 1.37, body);
  part(0, 0.84, 1.31, 1.78, 0.22, 1.1, body);
  const cabin = part(0, 1.05, 0.14, 1.53, 0.63, 1.81, glass);
  cabin.rotation.x = -0.04;
  part(0, 1.38, 0.24, 1.56, 0.09, 1.4, body);
  part(0, 1.08, 0.55, 1.58, 0.64, 0.07, body);
  part(0, 0.62, -2.065, 0.97, 0.16, 0.035, trim);
  for (const side of [-1, 1]) {
    part(side * 0.65, 0.69, -2.07, 0.38, 0.16, 0.035, headlight);
    part(side * 0.66, 0.69, 2.07, 0.37, 0.17, 0.035, taillight);
    part(side * 1.02, 0.99, -0.53, 0.22, 0.12, 0.3, body);
    part(side * 0.97, 0.6, 0.38, 0.025, 0.045, 0.28, trim);
  }
  const tireMaterial = new THREE.MeshStandardMaterial({
    color: "#151a1e",
    roughness: 0.96,
  });
  const rimMaterial = new THREE.MeshStandardMaterial({
    color: "#bcc9cc",
    roughness: 0.3,
    metalness: 0.7,
  });
  const tireGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 12);
  tireGeometry.rotateZ(Math.PI / 2);
  const rimGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.27, 6);
  rimGeometry.rotateZ(Math.PI / 2);
  const wheels: { pivot: THREE.Group; wheel: THREE.Group; front: boolean }[] =
    [];
  for (const z of [-1.28, 1.3]) {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.96, 0.34, z);
      const wheel = new THREE.Group();
      const tire = new THREE.Mesh(tireGeometry, tireMaterial);
      tire.castShadow = true;
      wheel.add(tire, new THREE.Mesh(rimGeometry, rimMaterial));
      pivot.add(wheel);
      group.add(pivot);
      wheels.push({ pivot, wheel, front: z < 0 });
    }
  }
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24),
    new THREE.MeshBasicMaterial({
      color: "#152127",
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.2, 2.4, 1);
  shadow.position.y = 0.07;
  group.add(shadow);
  return { group, wheels, taillight };
}

function disposeScene(scene: THREE.Scene) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      materials.add(material);
    }
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

export function RoadScene(props: RoadSceneProps) {
  const container = useRef<HTMLDivElement>(null);
  const motion = useRef(props);
  useEffect(() => {
    motion.current = props;
  }, [props]);

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    const onError = (message: string) => motion.current.onError(message);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      onError(
        "Die 3D-Ansicht benötigt WebGL. Aktiviere die Hardwarebeschleunigung deines Browsers und lade die Seite neu.",
      );
      return;
    }
    const local = createSceneWorld(props.world);
    const scene = new THREE.Scene();
    const sky = new THREE.Color("#c4dce0");
    scene.background = sky;
    scene.fog = new THREE.Fog(sky, 150, 600);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.03;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute(
      "aria-label",
      "3D-Fahrt auf echten Straßen",
    );
    host.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(61, 1, 0.12, 1100);
    scene.add(new THREE.HemisphereLight("#e1f1ff", "#7b8369", 2.1));
    const sun = new THREE.DirectionalLight("#ffe7c7", 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.08;
    scene.add(sun, sun.target);
    const width = local.bounds.maxX - local.bounds.minX + 1500;
    const depth = local.bounds.maxZ - local.bounds.minZ + 1500;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color: "#94a28a", roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(
      (local.bounds.maxX + local.bounds.minX) / 2,
      -0.03,
      (local.bounds.maxZ + local.bounds.minZ) / 2,
    );
    ground.receiveShadow = true;
    scene.add(ground);
    const roads = makeRoads(local);
    scene.add(roads.group, makeScenery(local));
    const car = makeCar();
    scene.add(car.group);
    host.dataset.roadCount = String(local.roads.length);
    host.dataset.sceneReady = "false";
    let widthPixels = 1;
    let heightPixels = 1;
    const resize = () => {
      widthPixels = Math.max(1, host.clientWidth);
      heightPixels = Math.max(1, host.clientHeight);
      renderer.setSize(widthPixels, heightPixels);
      camera.aspect = widthPixels / heightPixels;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    let animation = 0;
    let previousTime = 0;
    let initialized = false;
    let failed = false;
    let previousSpeed = 0;
    let previousDistance = 0;
    let wheelTravel = 0;
    let ready = false;
    let heading = 0;
    const targetPosition = new THREE.Vector3();
    const cameraPosition = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();
    const smoothedTarget = new THREE.Vector3();
    const contextLost = (event: Event) => {
      event.preventDefault();
      failed = true;
      host.dataset.sceneReady = "false";
      cancelAnimationFrame(animation);
      onError(
        "Die 3D-Verbindung wurde unterbrochen. Lade die Seite neu, um weiterzufahren.",
      );
    };
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    const render = (now: number) => {
      if (failed) return;
      const elapsed = previousTime
        ? Math.min((now - previousTime) / 1000, 0.05)
        : 1 / 60;
      previousTime = now;
      const current = motion.current;
      const point = projectCoordinate(current.coordinate, local.origin);
      const desiredHeading = (-current.bearing * Math.PI) / 180;
      const forwardX = Math.sin((current.bearing * Math.PI) / 180);
      const forwardZ = -Math.cos((current.bearing * Math.PI) / 180);
      // A one-meter right lane offset stays inside the graph's road ribbon.
      targetPosition.set(point.x - forwardZ, ROAD_HEIGHT, point.z + forwardX);
      const positionJump = car.group.position.distanceTo(targetPosition);
      const teleport =
        !initialized ||
        positionJump > 80 ||
        (Math.abs(current.speedKmh) < 0.01 && positionJump > 15) ||
        current.distanceMeters < previousDistance - 0.5;
      previousDistance = current.distanceMeters;
      if (teleport) {
        car.group.position.copy(targetPosition);
        heading = desiredHeading;
      } else {
        car.group.position.lerp(targetPosition, 1 - Math.exp(-18 * elapsed));
        const turn = Math.atan2(
          Math.sin(desiredHeading - heading),
          Math.cos(desiredHeading - heading),
        );
        heading += turn * (1 - Math.exp(-11 * elapsed));
      }
      car.group.rotation.y = heading;
      car.group.rotation.z =
        -current.steering *
        Math.min(Math.abs(current.speedKmh) / 60, 1) *
        0.025;
      // The odometer is absolute; wheel rotation must also reverse with the car.
      wheelTravel += (current.speedKmh / 3.6) * elapsed;
      for (const wheel of car.wheels) {
        wheel.wheel.rotation.x = -wheelTravel / 0.34;
        wheel.pivot.rotation.y = wheel.front ? -current.steering * 0.35 : 0;
      }
      const braking =
        Math.abs(current.speedKmh) < previousSpeed - 0.15 ||
        current.speedKmh < -0.5;
      car.taillight.emissiveIntensity = braking ? 2.2 : 0.45;
      previousSpeed = Math.abs(current.speedKmh);
      const directionX = -Math.sin(heading);
      const directionZ = -Math.cos(heading);
      const speed = Math.abs(current.speedKmh);
      const chaseDistance = 9.8 + Math.min(speed, 80) * 0.035;
      const hood = current.cameraMode === "hood";
      cameraPosition.set(
        car.group.position.x + directionX * (hood ? 1.02 : -chaseDistance),
        hood ? 1.4 : 4.5 + Math.min(speed, 80) * 0.012,
        car.group.position.z + directionZ * (hood ? 1.02 : -chaseDistance),
      );
      cameraTarget.set(
        car.group.position.x + directionX * (hood ? 35 : 12),
        hood ? 1.25 : 0.9,
        car.group.position.z + directionZ * (hood ? 35 : 12),
      );
      if (teleport) {
        camera.position.copy(cameraPosition);
        smoothedTarget.copy(cameraTarget);
      } else {
        camera.position.lerp(cameraPosition, 1 - Math.exp(-7 * elapsed));
        smoothedTarget.lerp(cameraTarget, 1 - Math.exp(-8 * elapsed));
      }
      camera.lookAt(smoothedTarget);
      const fov = (hood ? 67 : 61) + Math.min(speed, 80) * 0.07;
      if (Math.abs(camera.fov - fov) > 0.04) {
        camera.fov += (fov - camera.fov) * (1 - Math.exp(-5 * elapsed));
        camera.updateProjectionMatrix();
      }
      sun.position.set(
        car.group.position.x - 55,
        100,
        car.group.position.z - 45,
      );
      sun.target.position.copy(car.group.position);
      initialized = true;
      try {
        renderer.render(scene, camera);
        if (
          !ready &&
          widthPixels > 1 &&
          heightPixels > 1 &&
          local.roads.length > 0 &&
          roads.roadGeometry.getAttribute("position").count > 0 &&
          renderer.info.render.triangles > 0
        ) {
          ready = true;
          host.dataset.sceneReady = "true";
        }
      } catch {
        failed = true;
        host.dataset.sceneReady = "false";
        onError(
          "Die 3D-Ansicht konnte nicht dargestellt werden. Lade die Seite neu oder teste einen aktuellen Browser.",
        );
        return;
      }
      animation = requestAnimationFrame(render);
    };
    animation = requestAnimationFrame(render);
    return () => {
      failed = true;
      cancelAnimationFrame(animation);
      observer.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      sun.shadow.dispose();
      disposeScene(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      host.dataset.sceneReady = "false";
    };
  }, [props.world]);

  return (
    <div
      ref={container}
      className="road-scene"
      data-scene-ready="false"
      data-road-count="0"
      aria-label="3D-Fahransicht mit Straßen aus OpenStreetMap"
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    />
  );
}
