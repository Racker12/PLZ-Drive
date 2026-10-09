import { expect, test, type Page } from "@playwright/test";
import type { Coordinate, GameWorld, RoadEdge } from "../../src/lib/types";

// This synthetic road graph isolates rendering and controls from public APIs.
// These checks do not claim to validate live OSM or postal-code services.
const points: Record<string, Coordinate> = {
  a: [13.4, 52.5],
  b: [13.4, 52.50012],
  c: [13.402, 52.50012],
  d: [13.402, 52.501],
  e: [13.4, 52.501],
};

const edges: RoadEdge[] = [
  ["a", "b"],
  ["b", "c"],
  ["c", "d"],
  ["b", "e"],
].flatMap(([from, to]) => [
  {
    id: `${from}-${to}`,
    from,
    to,
    coordinates: [points[from], points[to]],
    name: "Teststraße",
  },
  {
    id: `${to}-${from}`,
    from: to,
    to: from,
    coordinates: [points[to], points[from]],
    name: "Teststraße",
  },
]);

const world: GameWorld = {
  postalCode: "10115",
  place: "Browser-Testgebiet",
  state: "Test-Bundesland",
  center: points.a,
  startNodeId: "a",
  fallback: false,
  graph: {
    nodes: Object.fromEntries(
      Object.entries(points).map(([id, coordinate]) => [
        id,
        { id, coordinate },
      ]),
    ),
    edges,
  },
};

const tilePattern = "https://basemaps.cartocdn.com/**";
const tilePixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function startWorld(page: Page) {
  await page.route("**/api/start", (route) => route.fulfill({ json: world }));
  await page.goto("/");
  await page.getByLabel("WO SOLL DEINE FAHRT BEGINNEN?").fill(world.postalCode);
  await page
    .getByRole("button", { name: "Spiel starten", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: world.place, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".location-coordinates")).toContainText("52.50000");
}

async function expectFullScreenScene(page: Page) {
  const scene = page.locator(".road-scene");
  await expect(page.locator(".game-screen")).toHaveAttribute("data-view", "3d");
  await expect(scene).toHaveAttribute("data-scene-ready", "true");
  expect(Number(await scene.getAttribute("data-road-count"))).toBeGreaterThan(
    0,
  );
  await expect(
    page.getByLabel("3D-Fahrt auf echten Straßen", { exact: true }),
  ).toBeVisible();
  // A mounted canvas can still have zero height. Check its actual layout and
  // backing store as well as the renderer's completed-geometry signal above.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const screen = document
          .querySelector(".game-screen")
          ?.getBoundingClientRect();
        const scene = document
          .querySelector(".road-scene")
          ?.getBoundingClientRect();
        const canvas =
          document.querySelector<HTMLCanvasElement>(".road-scene canvas");
        const bounds = canvas?.getBoundingClientRect();
        return Boolean(
          screen &&
            scene &&
            canvas &&
            bounds &&
            screen.height > 100 &&
            canvas.width > 0 &&
            canvas.height > 0 &&
            Math.abs(scene.height - screen.height) < 1 &&
            Math.abs(bounds.height - screen.height) < 1 &&
            Math.abs(bounds.width - screen.width) < 1,
        );
      }),
    )
    .toBe(true);
}

async function coordinate(page: Page): Promise<Coordinate> {
  const text = await page.locator(".location-coordinates").innerText();
  const match = text.match(/([\d.]+)° N\s*\/\s*([\d.]+)° E/);
  if (!match) throw new Error(`Unreadable coordinate: ${text}`);
  return [Number(match[2]), Number(match[1])];
}

async function speed(page: Page): Promise<number> {
  return Number(await page.locator(".speed strong").innerText());
}

function onGraph([longitude, latitude]: Coordinate): boolean {
  // Coordinates in the HUD round to five decimals.
  const epsilon = 0.0000051;
  return edges.some((edge) => {
    const [from, to] = edge.coordinates;
    return (
      longitude >= Math.min(from[0], to[0]) - epsilon &&
      longitude <= Math.max(from[0], to[0]) + epsilon &&
      latitude >= Math.min(from[1], to[1]) - epsilon &&
      latitude <= Math.max(from[1], to[1]) + epsilon &&
      (from[0] === to[0]
        ? Math.abs(longitude - from[0]) < epsilon
        : Math.abs(latitude - from[1]) < epsilon)
    );
  });
}

function metersBetween(from: Coordinate, to: Coordinate): number {
  const north = (to[1] - from[1]) * 111_195;
  const east =
    (to[0] - from[0]) * 111_195 * Math.cos((from[1] * Math.PI) / 180);
  return Math.hypot(north, east);
}

function routeProgress(point: Coordinate): number {
  if (point[0] <= points.a[0] + 0.0000051)
    return metersBetween(points.a, point);
  if (point[1] <= points.b[1] + 0.0000051) {
    return metersBetween(points.a, points.b) + metersBetween(points.b, point);
  }
  return (
    metersBetween(points.a, points.b) +
    metersBetween(points.b, points.c) +
    metersBetween(points.c, point)
  );
}

async function expectStopped(page: Page) {
  await expect(page.locator(".speed strong")).toHaveText("00");
  const before = await page.locator(".location-coordinates").innerText();
  const distanceBefore = await page.locator(".trip > strong").innerText();
  // Observe multiple animation frames: stale held input must not move a paused car.
  const after = await page.evaluate(async () => {
    const started = performance.now();
    await new Promise<void>((resolve) => {
      const frame = () =>
        performance.now() - started >= 650
          ? resolve()
          : requestAnimationFrame(frame);
      requestAnimationFrame(frame);
    });
    return {
      coordinates: document.querySelector(".location-coordinates")?.textContent,
      distance: document.querySelector(".trip > strong")?.textContent,
    };
  });
  expect(after.coordinates?.replace(/\s+/g, " ").trim()).toBe(
    before.replace(/\s+/g, " ").trim(),
  );
  expect(after.distance?.replace(/\s+/g, " ").trim()).toBe(
    distanceBefore.replace(/\s+/g, " ").trim(),
  );
}

test.beforeEach(async ({ page }) => {
  // Only the automatic 2D fallback may use tiles. A stub keeps it deterministic.
  await page.route(tilePattern, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: tilePixel }),
  );
});

test("validates five postal digits locally and filters non-numeric input", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/start")) requests.push(request.url());
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Spiel starten", exact: true })
    .click();
  await expect(page.locator(".start-form").getByRole("alert")).toContainText(
    "genau 5 Ziffern",
  );
  const input = page.getByLabel("WO SOLL DEINE FAHRT BEGINNEN?");
  await input.fill("1a2");
  await expect(input).toHaveValue("12");
  await page
    .getByRole("button", { name: "Spiel starten", exact: true })
    .click();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "10115 · Berlin" }).click();
  await expect(input).toHaveValue("10115");
  await expect(page.locator(".start-form").getByRole("alert")).toHaveCount(0);
});

test("starts the instant Berlin drive through the snapshot API option", async ({
  page,
}) => {
  const received: unknown[] = [];
  await page.route("**/api/start", (route) => {
    received.push(route.request().postDataJSON());
    return route.fulfill({ json: world });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Berlin sofort testen" }).click();
  await expect(
    page.getByRole("heading", { name: world.place, exact: true }),
  ).toBeVisible();
  await expectFullScreenScene(page);
  expect(received).toEqual([{ postalCode: "10115", preferSnapshot: true }]);
});

test("shows pending startup and a helpful API error without losing the input", async ({
  page,
}) => {
  let releaseResponse!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const received: unknown[] = [];
  await page.route("**/api/start", async (route) => {
    received.push(route.request().postDataJSON());
    await gate;
    await route.fulfill({
      status: 503,
      json: {
        error:
          "Der Straßendienst ist gerade nicht erreichbar. Bitte versuche es später erneut.",
      },
    });
  });
  await page.goto("/");
  const input = page.getByLabel("WO SOLL DEINE FAHRT BEGINNEN?");
  await input.fill("10115");
  await page
    .getByRole("button", { name: "Spiel starten", exact: true })
    .click();
  try {
    await expect(
      page.getByRole("button", { name: "Straßen werden vorbereitet …" }),
    ).toBeDisabled();
    await expect(input).toBeDisabled();
    await expect(
      page.getByText("Wir suchen deinen Ort und laden das Straßennetz.", {
        exact: false,
      }),
    ).toBeVisible();
  } finally {
    releaseResponse();
  }
  await expect(page.locator(".start-form").getByRole("alert")).toContainText(
    "Straßendienst ist gerade nicht erreichbar",
  );
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue("10115");
  await expect(
    page.getByRole("button", { name: "Spiel starten", exact: true }),
  ).toBeEnabled();
  expect(received).toEqual([{ postalCode: "10115" }]);
});

test("renders a full-height 3D street scene without requiring map tiles", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const mapRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    if (/basemaps\.cartocdn\.com|maplibre-worker/.test(request.url()))
      mapRequests.push(request.url());
  });
  await startWorld(page);
  await expectFullScreenScene(page);
  await expect(page.locator(".game-screen")).toHaveAttribute(
    "data-camera",
    "chase",
  );
  await expect(
    page.getByText("VERFOLGERKAMERA", { exact: true }),
  ).toBeVisible();
  await expectStopped(page);
  await page.screenshot({ path: "/tmp/plz-3d-test.png", fullPage: true });
  expect(mapRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("accelerates smoothly and turns right along the real graph instead of steering off-road", async ({
  page,
}) => {
  await startWorld(page);
  await expectFullScreenScene(page);
  await page.keyboard.down("ArrowUp");
  await expect.poll(() => speed(page)).toBeGreaterThanOrEqual(5);
  const initialSpeed = await speed(page);
  expect(initialSpeed).toBeLessThan(60);
  await expect
    .poll(async () => (await coordinate(page))[1])
    .toBeGreaterThan(points.a[1]);
  const north = await coordinate(page);
  expect(north[0]).toBe(points.a[0]);
  expect(onGraph(north)).toBe(true);
  // Throttle and steering remain held simultaneously: right is relative to the
  // north-facing car at b, rather than a replacement eastward movement command.
  await page.keyboard.down("ArrowRight");
  await expect
    .poll(async () => (await coordinate(page))[0])
    .toBeGreaterThan(points.b[0]);
  await expect.poll(() => speed(page)).toBeGreaterThan(initialSpeed);
  for (let sample = 0; sample < 5; sample += 1) {
    expect(onGraph(await coordinate(page))).toBe(true);
    expect(await speed(page)).toBeLessThanOrEqual(60);
    await page.waitForTimeout(120);
  }
  const east = await coordinate(page);
  expect(east[1]).toBe(points.b[1]);
  await expect(page.locator(".trip > strong")).not.toContainText("0.00");
  await page.keyboard.up("ArrowRight");
  await page.keyboard.up("ArrowUp");
  await page.getByRole("button", { name: "Fahrt pausieren" }).click();
  await expectStopped(page);
});

test("coasts when releasing throttle, brakes, and reverses continuously on the road", async ({
  page,
}) => {
  await startWorld(page);
  await expectFullScreenScene(page);
  await page.keyboard.down("w");
  await expect.poll(() => speed(page)).toBeGreaterThanOrEqual(12);
  const beforeRelease = await coordinate(page);
  const speedBeforeRelease = await speed(page);
  await page.keyboard.up("w");
  await expect
    .poll(async () => routeProgress(await coordinate(page)))
    .toBeGreaterThan(routeProgress(beforeRelease));
  expect(await speed(page)).toBeGreaterThan(0);
  expect(await speed(page)).toBeLessThanOrEqual(speedBeforeRelease);
  const beforeBrake = await coordinate(page);
  await page.keyboard.down("s");
  await expect(page.locator(".gear")).toHaveText("R");
  const reverseStart = await coordinate(page);
  expect(onGraph(reverseStart)).toBe(true);
  // Braking must slow the car before reverse; it must not jump backwards.
  expect(routeProgress(reverseStart)).toBeGreaterThanOrEqual(
    routeProgress(beforeBrake) - 1.5,
  );
  await expect
    .poll(async () => routeProgress(await coordinate(page)))
    .toBeLessThan(routeProgress(reverseStart) - 1);
  let previous = await coordinate(page);
  for (let sample = 0; sample < 4; sample += 1) {
    const started = Date.now();
    await page.waitForTimeout(120);
    const next = await coordinate(page);
    expect(onGraph(next)).toBe(true);
    // Includes HUD rounding tolerance; even delayed software rendering cannot
    // hide a teleport behind a state that happens to be on the graph.
    expect(metersBetween(previous, next)).toBeLessThanOrEqual(
      ((Date.now() - started) / 1000) * (60 / 3.6) + 2,
    );
    previous = next;
  }
  await page.keyboard.up("s");
  await page.keyboard.press("Space");
  await expectStopped(page);
});

test("changes between chase and hood cameras with both button and keyboard", async ({
  page,
}) => {
  await startWorld(page);
  await expectFullScreenScene(page);
  await page.getByRole("button", { name: "Kamera wechseln" }).click();
  await expect(page.locator(".game-screen")).toHaveAttribute(
    "data-camera",
    "hood",
  );
  await expect(page.getByText("HAUBENKAMERA", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/plz-3d-hood-test.png", fullPage: true });
  await page.keyboard.press("c");
  await expect(page.locator(".game-screen")).toHaveAttribute(
    "data-camera",
    "chase",
  );
  await expectFullScreenScene(page);
  await expectStopped(page);
});

test("pauses immediately, resumes, relocates, and returns to the postal-code screen", async ({
  page,
}) => {
  await startWorld(page);
  await expectFullScreenScene(page);
  await page.keyboard.down("w");
  await expect.poll(() => speed(page)).toBeGreaterThan(5);
  await page.keyboard.press("Space");
  await page.keyboard.up("w");
  await expect(
    page.getByRole("heading", { name: "Kurze Pause." }),
  ).toBeVisible();
  await expectStopped(page);
  await page.getByRole("button", { name: "Weiterfahren" }).click();
  await expect(page.getByRole("heading", { name: "Kurze Pause." })).toHaveCount(
    0,
  );
  await page.keyboard.down("w");
  await expect.poll(() => speed(page)).toBeGreaterThan(5);
  await page.keyboard.up("w");
  const oldPosition = await coordinate(page);
  await page.getByRole("button", { name: "Neuen Startpunkt wählen" }).click();
  await expect(page.locator(".trip > strong")).toContainText("0.00");
  const relocated = await coordinate(page);
  expect(relocated).not.toEqual(oldPosition);
  expect(Object.values(points)).toContainEqual(relocated);
  await expectStopped(page);
  await page.getByRole("button", { name: "Andere PLZ" }).click();
  await expect(
    page.getByRole("button", { name: "Spiel starten", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("WO SOLL DEINE FAHRT BEGINNEN?")).toHaveValue(
    "10115",
  );
  await page
    .getByRole("button", { name: "Spiel starten", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: world.place, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".location-coordinates")).toContainText("52.50000");
  await expectFullScreenScene(page);
});

test("automatically keeps the game playable in the road-map fallback without WebGL", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (
        type === "webgl" ||
        type === "webgl2" ||
        type === "experimental-webgl"
      )
        return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await startWorld(page);
  await expect(page.locator(".game-screen")).toHaveAttribute(
    "data-view",
    "map",
  );
  await expect(
    page.getByLabel("Vereinfachtes echtes Straßennetz"),
  ).toBeVisible();
  await expect(page.locator(".scene-error")).toContainText("3D-Ansicht");
  await expect(page.locator(".scene-error")).toContainText("Kartenansicht");
  await expect(
    page.getByRole("button", { name: "Kamera wechseln" }),
  ).toBeDisabled();
  await page.keyboard.down("w");
  await expect
    .poll(async () => (await coordinate(page))[1])
    .toBeGreaterThan(points.a[1]);
  expect(onGraph(await coordinate(page))).toBe(true);
  await page.keyboard.up("w");
  await page.keyboard.press("Space");
  await expectStopped(page);
});

test("fits a mobile viewport and supports held on-screen throttle and brake controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await startWorld(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await expectFullScreenScene(page);
  const throttle = page.getByRole("button", { name: "Gas geben" });
  await expect(throttle).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Bremsen und rückwärts fahren" }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Links abbiegen" }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Rechts abbiegen" }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Andere PLZ" }),
  ).toBeInViewport();
  await expect(page.getByLabel("Fahrtinformationen")).toBeInViewport();
  const button = await throttle.boundingBox();
  expect(button).not.toBeNull();
  await page.mouse.move(
    button!.x + button!.width / 2,
    button!.y + button!.height / 2,
  );
  await page.mouse.down();
  await expect(throttle).toHaveClass(/pressed/);
  await expect
    .poll(async () => (await coordinate(page))[1])
    .toBeGreaterThan(points.a[1]);
  await page.mouse.up();
  await expect(throttle).not.toHaveClass(/pressed/);
  await page.getByRole("button", { name: "Fahrt pausieren" }).click();
  await expectStopped(page);
  await page.screenshot({
    path: "/tmp/plz-3d-mobile-test.png",
    fullPage: true,
  });
});
