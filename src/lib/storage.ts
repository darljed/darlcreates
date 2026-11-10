import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";

/**
 * S3 storage for STL files, product photos, customer images, payment proof.
 * Degrades gracefully when AWS is not configured (dev before creds exist):
 * `isStorageConfigured()` is false and callers should guard on it.
 */
const region = process.env.AWS_REGION;
const bucket = process.env.S3_BUCKET;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const cdnBase = process.env.CDN_BASE_URL;

export function isStorageConfigured(): boolean {
  return Boolean(region && bucket && accessKeyId && secretAccessKey);
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (!isStorageConfigured()) {
    throw new Error("S3 storage is not configured (missing AWS env vars)");
  }
  _client ??= new S3Client({
    region,
    credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
  });
  return _client;
}

const PREFIXES = {
  // 3D models (STL / 3MF). Older uploads live under "stl/"; those keys stay valid.
  model: "models",
  photo: "photos",
  customer: "customer",
  proof: "proof",
  review: "reviews",
} as const;
export type UploadKind = keyof typeof PREFIXES;

/** Build a collision-resistant, prefix-scoped object key. */
export function buildKey(kind: UploadKind, filename: string, scope?: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const dir = scope ? `${PREFIXES[kind]}/${scope.replace(/[^A-Za-z0-9_-]/g, "_")}` : PREFIXES[kind];
  return `${dir}/${nanoid(12)}-${safe}`;
}

/** Presigned PUT URL for a direct browser upload (scoped key + content-type). */
export async function presignUpload(
  key: string,
  contentType: string,
  expiresIn = 300,
): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    // Sign content-type so the PUT must use exactly the type we validated.
    { expiresIn, signableHeaders: new Set(["content-type"]) },
  );
}

/** A URL to read an object: CDN if configured, else a signed GET URL. */
export async function readUrl(
  key: string | null | undefined,
  expiresIn = 3600,
): Promise<string | null> {
  if (!key) return null;
  if (cdnBase) return `${cdnBase.replace(/\/$/, "")}/${key}`;
  if (!isStorageConfigured()) return null;
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn },
  );
}

/**
 * Stable, never-expiring URL for a public catalog file (product photo / STL).
 * Pure string — safe to embed in cached/prerendered pages. The route at
 * /api/files/[...key] signs a fresh short-lived S3 URL per request (gap G-03).
 */
export function fileUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Size in bytes of an object, or null if it doesn't exist. */
export async function headObject(key: string): Promise<number | null> {
  try {
    const res = await client().send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return res.ContentLength ?? 0;
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === "NotFound" || name === "NoSuchKey") return null;
    throw err;
  }
}

/** First `n` bytes of an object (ranged GET). Used to sanity-check file signatures. */
export async function peekBytes(key: string, n = 4): Promise<Uint8Array> {
  const res = await client().send(
    new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${n - 1}` }),
  );
  return (await res.Body?.transformToByteArray()) ?? new Uint8Array();
}

/** Delete every object under `prefix` (used when a user deletes their account). Returns the count. */
export async function deletePrefix(prefix: string): Promise<number> {
  if (!prefix.endsWith("/") || prefix.split("/").filter(Boolean).length < 2) {
    throw new Error("deletePrefix needs a specific folder like customer/<id>/");
  }
  let deleted = 0;
  let token: string | undefined;
  do {
    const page = await client().send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
    if (keys.length) {
      await client().send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }));
      deleted += keys.length;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return deleted;
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
