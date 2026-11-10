/**
 * STL viewer framing: any model must end up centered and fully in view.
 * Simulates the real camera and projects every vertex. No browser needed.
 * Optional real files:  npx tsx scripts/test-viewer-framing.ts path/to/model.stl ...
 * Run: npx tsx scripts/test-viewer-framing.ts
 */
import { readFileSync } from "node:fs";
import { BoxGeometry, BufferGeometry, Color, Euler, Group, Matrix4, Mesh, MeshPhongMaterial, PerspectiveCamera, Vector3 } from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { centerGeometry, DEFAULT_3MF_MATERIAL, frameModel, measureObject, prepareMultiPart, VIEWER_FOV_DEG } from "../src/lib/viewer-framing";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); }
  else console.log(`  ✓ ${name}`);
}

/** Worst |NDC| over all vertices, and the silhouette's center offset (what the eye reads as "centered"). */
function view(geo: BufferGeometry, orbitDeg: number): { worst: number; offX: number; offY: number } {
  const { radius } = centerGeometry(geo);
  const f = frameModel(radius);
  const cam = new PerspectiveCamera(VIEWER_FOV_DEG, 1, f.near, f.far); // square canvas
  const p = new Vector3(...f.position).applyAxisAngle(new Vector3(0, 1, 0), (orbitDeg * Math.PI) / 180);
  cam.position.copy(p);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const upright = new Matrix4().makeRotationFromEuler(new Euler(-Math.PI / 2, 0, 0)); // same as the mesh
  const pos = geo.getAttribute("position");
  const v = new Vector3(); let worst = 0;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.count; i += Math.max(1, (pos.count / 4000) | 0)) {
    v.fromBufferAttribute(pos, i).applyMatrix4(upright).project(cam);
    worst = Math.max(worst, Math.abs(v.x), Math.abs(v.y));
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  }
  return { worst, offX: (x0 + x1) / 2, offY: (y0 + y1) / 2 };
}

function check(label: string, make: () => BufferGeometry) {
  console.log(`\n${label}`);
  const g = make();
  const { geometry } = centerGeometry(g.clone());
  const c = geometry.boundingBox!.getCenter(new Vector3());
  assert("centered on its own bounding box", c.length() < 1e-3 * Math.max(1, geometry.boundingSphere!.radius), `center=${c.toArray()}`);
  for (const angle of [0, 45, 90, 180, 270]) {
    const w = view(make(), angle);
    assert(`fully in view at orbit ${angle}° (worst |NDC|=${w.worst.toFixed(2)})`, w.worst <= 1.0);
    // Silhouette center should read as centered: within 12% of half-frame (NDC spans -1..1).
    assert(
      `silhouette centered at orbit ${angle}° (off x=${w.offX.toFixed(2)}, y=${w.offY.toFixed(2)})`,
      Math.abs(w.offX) <= 0.12 && Math.abs(w.offY) <= 0.12,
    );
  }
  const f = frameModel(centerGeometry(make()).radius);
  assert("zoom limits bracket the camera distance", f.minDistance < f.distance && f.distance < f.maxDistance);
  assert("clip planes sane (near < distance < far)", f.near < f.distance && f.distance < f.far);
}

// Reproduces the owner's bug: part exported at the middle of a 256 bed (center 128,128,15)
check("Off-origin like the Outdoor Phone Stand (30.6 x 70.6 x 30.1 @ 128,128,15)", () =>
  new BoxGeometry(30.6, 70.6, 30.1).translate(128, 128, 15));
check("Origin-centered small part (clicker cap 21 x 21 x 9)", () =>
  new BoxGeometry(21, 21, 9).translate(0, 0, 4.5));
check("Tiny model (units in meters: 0.03)", () => new BoxGeometry(0.03, 0.07, 0.03).translate(0.1, 0.1, 0.02));
check("Huge model (5000 units), far from origin", () => new BoxGeometry(4000, 5000, 3000).translate(-8000, 3000, 900));
check("Very flat plate (100 x 100 x 0.4)", () => new BoxGeometry(100, 100, 0.4).translate(50, 50, 0.2));

// ---- multi-part (3MF-like) models ----
console.log("\nMulti-part model (base + name), off-origin, one colored part and one default part");
{
  const base = new Mesh(new BoxGeometry(60, 30, 10).translate(128, 128, 5), new MeshPhongMaterial({ color: 0x2255ff }));
  const name = new Mesh(new BoxGeometry(40, 8, 3).translate(128, 128, 11.5), new MeshPhongMaterial({ name: DEFAULT_3MF_MATERIAL, color: 0xffffff }));
  const loaded = new Group(); loaded.add(base, name);

  const prepared = prepareMultiPart(loaded, "#ff8800", (m) => m.name === DEFAULT_3MF_MATERIAL);
  const { center, radius } = measureObject(prepared);
  assert("center is the middle of all parts (128,128,6.5: z spans 0..13)", Math.abs(center.x - 128) < 0.01 && Math.abs(center.y - 128) < 0.01 && Math.abs(center.z - 6.5) < 0.01, `center=${center.toArray()}`);
  assert("radius encloses every part", radius >= Math.hypot(60, 30, 13) / 2 - 1e-6);

  const mats = (g: Group, i: number) => ((g.children[i] as Mesh).material as MeshPhongMaterial);
  const pm = prepared as Group;
  assert("part WITH a color keeps it", mats(pm, 0).color.getHex() === 0x2255ff);
  assert("part WITHOUT a color gets the customer's color", mats(pm, 1).color.getHex() === new Color("#ff8800").getHex());
  assert("original (cached) object is not mutated", mats(loaded, 1).color.getHex() === 0xffffff && mats(loaded, 0).color.getHex() === 0x2255ff);
  assert("materials are cloned, not shared", mats(pm, 0) !== mats(loaded, 0));

  // centered after translating by -center, every point in view at several orbit angles
  for (const angle of [0, 90, 180, 270]) {
    const f = frameModel(radius);
    const cam = new PerspectiveCamera(VIEWER_FOV_DEG, 1, f.near, f.far);
    cam.position.copy(new Vector3(...f.position).applyAxisAngle(new Vector3(0, 1, 0), (angle * Math.PI) / 180));
    cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const upright = new Matrix4().makeRotationFromEuler(new Euler(-Math.PI / 2, 0, 0));
    let worst = 0;
    for (const m of [base, name]) {
      const pos = m.geometry.getAttribute("position"); const v = new Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).sub(center).applyMatrix4(upright).project(cam);
        worst = Math.max(worst, Math.abs(v.x), Math.abs(v.y));
      }
    }
    assert(`multi-part fully in view at orbit ${angle}° (worst |NDC|=${worst.toFixed(2)})`, worst <= 1);
  }
}

for (const file of process.argv.slice(2)) {
  const buf = readFileSync(file);
  const mk = () => new STLLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  check(`Real file: ${file.split("/").pop()}`, mk);
}

if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log("\nAll viewer-framing checks passed.");
