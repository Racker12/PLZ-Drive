import { expect, test, type Page } from "@playwright/test";
import type { Coordinate, GameWorld, RoadEdge } from "../../src/lib/types";

// A deliberately synthetic graph makes browser checks independent of public APIs.
// Live OSM/geocoding integration is checked separately, never claimed by these tests.
const points: Record<string, Coordinate> = {
  a: [13.4, 52.5],
  b: [13.4, 52.50012],
  c: [13.402, 52.50012],
  d: [13.402, 52.501],
};

const edges: RoadEdge[] = [
  ["a", "b"],
  ["b", "c"],
  ["c", "d"],
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

async function stubMapTiles(page: Page) {
  await page.route(tilePattern, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: tilePixel }),
  );
}

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

async function expectFullScreenMap(page: Page) {
  // A marker may exist while a zero-height, clipped map makes it invisible.
  // Check actual layout and viewport intersection, beyond CSS visibility.
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const screen = document
          .querySelector(".game-screen")
          ?.getBoundingClientRect();
        const map = document
          .querySelector(".road-map")
          ?.getBoundingClientRect();
        const canvas = document
          .querySelector(".road-map canvas")
          ?.getBoundingClientRect();
        return Boolean(
          screen &&
            map &&
            canvas &&
            map.height > 0 &&
            Math.abs(map.height - screen.height) < 1 &&
            Math.abs(canvas.height - screen.height) < 1,
        );
      }),
    )
    .toBe(true);
  await expect(page.getByLabel("Dein Auto")).toBeInViewport();
  // Visible markers alone do not prove the worker rendered any street geometry.
  await expect(page.locator(".road-map")).toHaveAttribute(
    "data-roads-visible",
    "true",
  );
}

async function coordinate(page: Page): Promise<Coordinate> {
  const text = await page.locator(".location-coordinates").innerText();
  const match = text.match(/([\d.]+)° N\s*\/\s*([\d.]+)° E/);
  if (!match) throw new Error(`Unreadable coordinate: ${text}`);
  return [Number(match[2]), Number(match[1])];
}

function onGraph([longitude, latitude]: Coordinate): boolean {
  // UI rounds to five decimals. Permit half that rounding unit at each segment.
  const epsilon = 0.0000051;
  return edges.some((edge) => {
    const [from, to] = edge.coordinates;
    const inBounds =
      longitude >= Math.min(from[0], to[0]) - epsilon &&
      longitude <= Math.max(from[0], to[0]) + epsilon &&
      latitude >= Math.min(from[1], to[1]) - epsilon &&
      latitude <= Math.max(from[1], to[1]) + epsilon;
    return (
      inBounds &&
      (from[0] === to[0]
        ? Math.abs(longitude - from[0]) < epsilon
        : Math.abs(latitude - from[1]) < epsilon)
    );
  });
}

async function expectStopped(page: Page) {
  await expect(page.locator(".speed strong")).toHaveText("00");
  const before = await page.locator(".location-coordinates").innerText();
  const distanceBefore = await page.locator(".trip > strong").innerText();
  // Observe across multiple animation frames, where stale held keys would move it.
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
  await stubMapTiles(page);
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

test("drives along graph segments, turns at a junction and stops on key release", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startWorld(page);
  await expectFullScreenMap(page);
  await page.keyboard.down("ArrowUp");
  await expect(page.locator(".speed strong")).toHaveText("35");
  await expect
    .poll(async () => (await coordinate(page))[1])
    .toBeGreaterThan(points.a[1]);
  const north = await coordinate(page);
  expect(north[0]).toBe(points.a[0]);
  expect(onGraph(north)).toBe(true);
  await page.keyboard.down("ArrowRight");
  await page.keyboard.up("ArrowUp");
  for (let sample = 0; sample < 5; sample += 1) {
    const current = await coordinate(page);
    expect(onGraph(current)).toBe(true);
    await page.waitForTimeout(160);
  }
  await expect
    .poll(async () => (await coordinate(page))[0])
    .toBeGreaterThan(points.b[0]);
  const east = await coordinate(page);
  expect(east[1]).toBe(points.b[1]);
  expect(onGraph(east)).toBe(true);
  await expect(page.locator(".trip > strong")).not.toContainText("0.00");
  await page.keyboard.up("ArrowRight");
  await expectStopped(page);
  expect(pageErrors).toEqual([]);
});

test("pauses, resumes, relocates, and returns to the postal-code screen", async ({
  page,
}) => {
  await startWorld(page);
  await page.keyboard.down("w");
  await expect(page.locator(".speed strong")).toHaveText("35");
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
  await expect(page.locator(".speed strong")).toHaveText("35");
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
});

test("keeps the car and road graph playable when background tiles fail", async ({
  page,
}) => {
  await page.unroute(tilePattern);
  await page.route(tilePattern, (route) => route.abort("failed"));
  await startWorld(page);
  await expect(
    page.getByText("Kartenhintergrund nicht verfügbar.", { exact: false }),
  ).toBeVisible();
  await expectFullScreenMap(page);
  await page.keyboard.down("ArrowUp");
  await expect
    .poll(async () => (await coordinate(page))[1])
    .toBeGreaterThan(points.a[1]);
  expect(onGraph(await coordinate(page))).toBe(true);
  await page.keyboard.up("ArrowUp");
  await expectStopped(page);
});

test("shows the simple road view when WebGL is unavailable", async ({
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
  await expect(
    page.getByLabel("Vereinfachtes echtes Straßennetz"),
  ).toBeVisible();
  await expect(
    page.getByText("WebGL nicht verfügbar.", { exact: false }),
  ).toBeVisible();
  await page.keyboard.down("w");
  await expect
    .poll(async () => (await coordinate(page))[1])
    .toBeGreaterThan(points.a[1]);
  await page.keyboard.up("w");
  await expectStopped(page);
});

test("fits a mobile viewport and offers functioning on-screen driving controls", async ({
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
  await expectFullScreenMap(page);
  const northButton = page.getByRole("button", { name: "Nach Norden fahren" });
  await expect(northButton).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Andere PLZ" }),
  ).toBeInViewport();
  await expect(page.getByLabel("Fahrtinformationen")).toBeInViewport();
  const button = await northButton.boundingBox();
  expect(button).not.toBeNull();
  await page.mouse.move(
    button!.x + button!.width / 2,
    button!.y + button!.height / 2,
  );
  await page.mouse.down();
  await expect
    .poll(async () => (await coordinate(page))[1])
    .toBeGreaterThan(points.a[1]);
  await page.mouse.up();
  await expectStopped(page);
});
