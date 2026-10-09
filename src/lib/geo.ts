import type { Coordinate } from "./types";

const EARTH_RADIUS_METERS = 6_371_008.8;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

export function isGermanPostalCode(value: string): boolean {
  return /^\d{5}$/.test(value);
}

export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const latitudeDifference = radians(b[1] - a[1]);
  const longitudeDifference = radians(b[0] - a[0]);
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(radians(a[1])) *
      Math.cos(radians(b[1])) *
      Math.sin(longitudeDifference / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

export function normalizeBearing(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/** Compass bearing: 0 north, 90 east. */
export function bearingDegrees(a: Coordinate, b: Coordinate): number {
  const longitudeDifference = radians(b[0] - a[0]);
  const firstLatitude = radians(a[1]);
  const secondLatitude = radians(b[1]);
  const y = Math.sin(longitudeDifference) * Math.cos(secondLatitude);
  const x =
    Math.cos(firstLatitude) * Math.sin(secondLatitude) -
    Math.sin(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.cos(longitudeDifference);
  return normalizeBearing((Math.atan2(y, x) * 180) / Math.PI);
}

/** Signed shortest turn in degrees, positive clockwise. */
export function headingDifference(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

export function interpolateCoordinate(
  a: Coordinate,
  b: Coordinate,
  t: number,
): Coordinate {
  const fraction = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
}
