"use client";

import { validateUpload, type AdminUploadKind } from "@/lib/uploads";

/** Presign -> PUT straight to S3 -> return the object key. */
export async function uploadToS3(kind: AdminUploadKind, file: File): Promise<string> {
  const problem = validateUpload(kind, file.name, file.type, file.size);
  if (problem) throw new Error(problem);

  const res = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind,
      filename: file.name,
      contentType: file.type,
      size: file.size,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not start upload");

  let put: Response;
  try {
    put = await fetch(data.url, {
      method: "PUT",
      headers: { "Content-Type": data.contentType },
      body: file,
    });
  } catch {
    // A CORS-blocked PUT never gets a response; the browser throws a bare TypeError.
    throw new Error(
      `Couldn't reach storage from ${window.location.origin}. The bucket's CORS rules probably don't list this address (see docs/setup.md).`,
    );
  }
  if (!put.ok) throw new Error(`Upload to storage failed (${put.status})`);
  return data.key as string;
}
