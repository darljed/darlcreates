/**
 * STL files for the admin design studio. An STL has no colours, so a design leaves as a ZIP with one binary STL per object and
 * colour, already positioned on the bed. The 3MF keeps the colours in one file.
 */
import { strToU8, zipSync } from "fflate";
import type { Mesh } from "./name-mesh";
import type { PrintObject } from "./clicker/export-3mf";

/** Binary STL (80-byte header, triangle count, 50 bytes a triangle). */
export function meshToStl(mesh: Mesh): Uint8Array {
  const n = mesh.indices.length / 3;
  const buf = new ArrayBuffer(84 + n * 50);
  const v = new DataView(buf);
  v.setUint32(80, n, true);
  const p = mesh.positions;
  for (let t = 0; t < n; t++) {
    const a = mesh.indices[t * 3] * 3, b = mesh.indices[t * 3 + 1] * 3, c = mesh.indices[t * 3 + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const wx = p[c] - p[a], wy = p[c + 1] - p[a + 1], wz = p[c + 2] - p[a + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const o = 84 + t * 50;
    [nx, ny, nz, p[a], p[a + 1], p[a + 2], p[b], p[b + 1], p[b + 2], p[c], p[c + 1], p[c + 2]].forEach((f, i) => v.setFloat32(o + i * 4, f, true));
  }
  return new Uint8Array(buf);
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "part";

function joinMeshes(meshes: Mesh[]): Mesh {
  const positions = new Float32Array(meshes.reduce((n, m) => n + m.positions.length, 0));
  const indices = new Uint32Array(meshes.reduce((n, m) => n + m.indices.length, 0));
  let pAt = 0, iAt = 0;
  for (const m of meshes) {
    const base = pAt / 3;
    positions.set(m.positions, pAt);
    for (let i = 0; i < m.indices.length; i++) indices[iAt + i] = m.indices[i] + base;
    pAt += m.positions.length;
    iAt += m.indices.length;
  }
  return { positions, indices };
}

/** A ZIP with one STL per print object and colour (a clicker's base and top, a keychain's plate and name); a README says which colour each is. */
export function objectsToStlZip(objects: PrintObject[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const notes: string[] = [];
  for (const o of objects) {
    const byColour = new Map<string, Mesh[]>();
    for (const piece of o.pieces) byColour.set(piece.color.toLowerCase(), [...(byColour.get(piece.color.toLowerCase()) ?? []), piece.mesh]);
    for (const [colour, meshes] of byColour) {
      const name = `${safe(o.name)}__${colour.replace("#", "")}.stl`;
      files[name] = meshToStl(joinMeshes(meshes));
      notes.push(`${name}  colour ${colour}`);
    }
  }
  files["README.txt"] = strToU8(`One STL per colour of each object, in millimetres, already placed on the bed. Import them together, then print each in its colour.\n\n${notes.join("\n")}\n`);
  return zipSync(files, { level: 1 });
}
