/**
 * The marketing generator's data shapes and constants. No server imports, so the browser can use them.
 */
import { z } from "zod";

export const copySchema = z.object({
  name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(140).default(""),
  description: z.string().trim().min(20).max(1500),
  highlights: z.array(z.string().trim().min(2).max(120)).min(2).max(6),
  tags: z.array(z.string().trim().min(2).max(30)).max(8).default([]),
  category: z.string().trim().min(2).max(40),
  seoTitle: z.string().trim().max(70).default(""),
  metaDescription: z.string().trim().max(170).default(""),
});
export type ProductCopy = z.infer<typeof copySchema>;

export const SCENES = ["hero", "lifestyle", "detail"] as const;
export type Scene = (typeof SCENES)[number];
export const SCENE_LABEL: Record<Scene, string> = { hero: "Hero (clean studio)", lifestyle: "In use (lifestyle)", detail: "Close-up detail" };
export const MAX_IMAGES_PER_DRAFT = 9;

// ---- the draft stored in ai_drafts.payload -------------------------------------------------------------------------

export const draftSchema = z.object({
  modelKey: z.string(),
  photoKeys: z.array(z.string()).max(6),
  notes: z.string().max(1500).default(""),
  facts: z.object({ fileName: z.string(), format: z.enum(["stl", "3mf"]), sizeMm: z.tuple([z.number(), z.number(), z.number()]).nullable(), triangles: z.number().nullable(), filaments: z.array(z.string()) }),
  copy: copySchema.nullable().default(null),
  price: z.string().max(20).default(""),
  images: z.array(z.object({ key: z.string(), scene: z.enum(SCENES), extra: z.string().default("") })).max(MAX_IMAGES_PER_DRAFT).default([]),
  costUsd: z.number().default(0),
  productId: z.string().nullable().default(null),
});
export type DraftPayload = z.infer<typeof draftSchema>;
