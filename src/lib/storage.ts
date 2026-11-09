import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
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
  stl: "stl",
  photo: "photos",
  customer: "customer",
  proof: "proof",
  review: "reviews",
} as const;
export type UploadKind = keyof typeof PREFIXES;

/** Build a collision-resistant, prefix-scoped object key. */
export function buildKey(kind: UploadKind, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  return `${PREFIXES[kind]}/${nanoid(12)}-${safe}`;
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
    { expiresIn },
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
