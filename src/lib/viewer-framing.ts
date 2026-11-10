import { Box3, Vector3, type BufferGeometry } from "three";

/**
 * Framing math for the STL viewer. Pure (no React/WebGL) so it can be tested.
 * The viewer must work for ANY model: tiny, huge, or exported off-origin
 * (slicers often place the part at the middle of the bed, e.g. 128,128).
 */

export const VIEWER_FOV_DEG = 40;

/**
 * Translate the geometry so its bounding-box center is at the origin. This makes
 * the orbit/rotate pivot the model's visual center (not the file's origin).
 * Mutates and returns `geometry` — pass a clone if the original is cached.
 */
export function centerGeometry(geometry: BufferGeometry): {
  geometry: BufferGeometry;
  size: Vector3;
  radius: number;
} {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox as Box3;
  const center = box.getCenter(new Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return {
    geometry,
    size: (geometry.boundingBox as Box3).getSize(new Vector3()),
    // Sphere centered on the (now origin-centered) box; radius is rotation-invariant.
    radius: Math.max(geometry.boundingSphere?.radius ?? 1, 1e-6),
  };
}

export type Framing = {
  /** Camera position looking at the origin from a pleasant 3/4 angle. */
  position: [number, number, number];
  distance: number;
  near: number;
  far: number;
  minDistance: number;
  maxDistance: number;
};

/**
 * Default view direction. Elevation is kept low on purpose: with a perspective camera,
 * the higher you look down on an elongated part the lower its silhouette sits in the
 * frame (measured: 0.07 NDC offset at 0°, 0.11 at 10°, 0.22 at 32°). 10° still shows
 * the top surface slightly and keeps the model visually centered at every orbit angle.
 */
export const DEFAULT_ELEVATION_DEG = 10;
export const DEFAULT_AZIMUTH_DEG = 35;

/** Camera placement + clip planes + zoom limits for a model of the given bounding radius. */
export function frameModel(radius: number, fovDeg = VIEWER_FOV_DEG): Framing {
  const r = Math.max(radius, 1e-6);
  // Distance at which a sphere of radius r just fits the vertical FOV, plus margin.
  const distance = (r / Math.sin((fovDeg * Math.PI) / 360)) * 1.25;
  const el = (DEFAULT_ELEVATION_DEG * Math.PI) / 180;
  const az = (DEFAULT_AZIMUTH_DEG * Math.PI) / 180;
  const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  return {
    position: [dir.x * distance, dir.y * distance, dir.z * distance],
    distance,
    near: Math.max(distance / 200, 1e-4),
    far: distance * 40,
    minDistance: r * 0.6,
    // 3x the framed distance: far enough to see context, never a lost speck.
    maxDistance: distance * 3,
  };
}
