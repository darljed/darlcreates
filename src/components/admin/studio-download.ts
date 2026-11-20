/** Admin design studio: ask the server to build the print file for a design and save it. Throws the server's message on a refusal. */
export async function downloadStudioFile(o: { productId: string; kind: "clicker" | "keychain"; format: "3mf" | "stl"; design: unknown; label?: string }): Promise<void> {
  const res = await fetch("/admin/studio/file", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? "Could not build the file");
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `${o.kind}.${o.format}`;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
