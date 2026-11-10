import { Box3, Vector3, type BufferGeometry, type Material, type Object3D } from "three";

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

/**
 * Center + radius for a multi-part model (e.g. a 3MF Group), in the model's own space.
 * Radius is the box half-diagonal: a sphere around the box center that encloses it,
 * so it stays valid at every orbit angle (slightly conservative vs. a tight sphere).
 */
export function measureObject(obj: Object3D): { center: Vector3; radius: number } {
  obj.updateWorldMatrix(true, true);
  const box = new Box3().setFromObject(obj);
  const center = box.getCenter(new Vector3());
  return { center, radius: Math.max(box.getSize(new Vector3()).length() / 2, 1e-6) };
}

/**
 * three's 3MFLoader names the material of parts that had no color/material in the
 * file `Loader.DEFAULT_MATERIAL_NAME` (= "__DEFAULT"). Mirrored here so this module
 * stays free of loader imports.
 */
export const DEFAULT_3MF_MATERIAL = "__DEFAULT";

/**
 * Clone a loaded 3MF so the cached original is never mutated, and give parts that have
 * NO color in the file the customer's chosen color. Parts with an explicit color/material
 * keep it (that's the point of 3MF: e.g. base in one color, the name in another).
 * `isDefault` decides whether a material counts as "no color in the file".
 */
export function prepareMultiPart(
  loaded: Object3D,
  color: string,
  isDefault: (m: Material) => boolean,
): Object3D {
  const clone = loaded.clone(true);
  clone.traverse((o) => {
    const mesh = o as Object3D & { isMesh?: boolean; material?: Material | Material[] };
    if (!mesh.isMesh || !mesh.material) return;
    const swap = (m: Material) => {
      const c = m.clone();
      if (isDefault(m) && "color" in c) (c as Material & { color: { set(v: string): void } }).color.set(color);
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
  return clone;
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
