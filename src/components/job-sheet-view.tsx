/**
 * One order line's print job sheet (see lib/job-sheet.ts): choices, the colour of every part with its filament number,
 * the name, the clicker design, the colours to load, and what must be done by hand. Used on the order page and on the
 * printable job sheet. No client state, so it prints.
 */
import type { JobSheet } from "@/lib/job-sheet";

const Swatch = ({ hex }: { hex: string }) => <span className="mr-1 inline-block size-3 rounded-full border border-black/40 align-middle" style={{ backgroundColor: hex }} aria-hidden />;
const Chip = ({ hex, name }: { hex: string; name: string }) => (
  <span><Swatch hex={hex} /><strong>{name}</strong> <span className="font-mono text-[0.85em]">{hex}</span></span>
);

export function JobSheetView({ sheet }: { sheet: JobSheet }) {
  return (
    <div className="space-y-2 text-sm">
      {sheet.model && <p><span className="font-medium">Model file:</span> <span className="font-mono">{sheet.model}</span></p>}
      {sheet.preset && <p><span className="font-medium">Design preset:</span> <strong>{sheet.preset}</strong> <span className="text-muted-foreground">(ready-made design: a pre-printed one can go in the parcel)</span></p>}

      {sheet.choices.length > 0 && (
        <ul>
          {sheet.choices.map((c, i) => (
            <li key={i}><span className="font-medium">{c.label}:</span> {c.hex ? <Chip hex={c.hex} name={c.value} /> : c.value}</li>
          ))}
        </ul>
      )}

      {sheet.parts.length > 0 && (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b text-left"><th className="py-1 pr-2">Part</th><th className="pr-2">Print in</th><th className="pr-2">Filament</th><th>Designer&apos;s 3MF</th></tr>
          </thead>
          <tbody>
            {sheet.parts.map((p, i) => (
              <tr key={i} className="border-b align-top">
                <td className="py-1 pr-2 font-semibold">{p.part}<div className="font-normal text-muted-foreground">{p.slicerParts}</div></td>
                <td className="pr-2"><Chip hex={p.hex} name={p.colour} /></td>
                <td className="pr-2">{p.filament ? `#${p.filament}` : <strong>set by hand</strong>}</td>
                <td>{p.designerHex ? <><Swatch hex={p.designerHex} /><span className="font-mono">{p.designerHex}</span>{p.designerFilament ? ` (#${p.designerFilament})` : ""}</> : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {sheet.name && (
        <p>
          <span className="font-medium">Name:</span> “{sheet.name.text}” · {sheet.name.font} · {sheet.name.mode} {sheet.name.depthMm} mm · {sheet.name.areaMm}
          {sheet.name.colour && <> · <Chip hex={sheet.name.colour.hex} name={sheet.name.colour.name} />{sheet.name.filament ? ` (filament #${sheet.name.filament})` : ""}</>}
        </p>
      )}

      {sheet.clicker && (
        <div>
          <p><span className="font-medium">{sheet.clicker.kind}:</span> {sheet.clicker.sizeMm} · {sheet.clicker.shape} · {sheet.clicker.switches} switch{sheet.clicker.switches === 1 ? "" : "es"}{sheet.clicker.keyring ? " · keyring" : ""}</p>
          <p><span className="font-medium">Base:</span> <Chip {...sheet.clicker.base} />{sheet.clicker.cap && <> · <span className="font-medium">Cap:</span> <Chip {...sheet.clicker.cap} /></>}</p>
          <ul className="list-disc pl-5">{sheet.clicker.layers.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      )}

      {sheet.keychain && (
        <div>
          <p><span className="font-medium">Keychain ({sheet.keychain.style}):</span> “{sheet.keychain.name}” · {sheet.keychain.font}</p>
          <p>{sheet.keychain.lengthMm} · {sheet.keychain.thicknessMm} · {sheet.keychain.ring}</p>
          <p>{sheet.keychain.parts.map((p) => <span key={p.part} className="mr-3 inline-block"><span className="font-medium">{p.part}:</span> <Chip {...p.colour} /></span>)}</p>
        </div>
      )}

      {sheet.filaments.length > 0 && (
        <p>
          <span className="font-medium">Load:</span>{" "}
          {sheet.filaments.map((f) => (
            <span key={f.hex} className="mr-3 inline-block"><Chip hex={f.hex} name={f.colour} />{f.filament ? ` #${f.filament}` : ""}</span>
          ))}
        </p>
      )}

      {sheet.warnings.length > 0 && (
        <ul className="rounded border border-amber-400 bg-amber-50 p-2 text-xs text-amber-950 print:bg-white">
          {sheet.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
        </ul>
      )}
    </div>
  );
}
