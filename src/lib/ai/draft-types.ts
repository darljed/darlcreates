/**
 * The Product studio's data shapes and constants. No server imports, so the browser can use them.
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
/** A mockup may follow a preset scene or the owner's own words. */
export const IMAGE_SCENES = [...SCENES, "custom"] as const;
export const MAX_IMAGES_PER_DRAFT = 12;
export const MAX_PHOTOS_PER_DRAFT = 6;
/** Mockups one chat message may make (each is a paid call). */
export const MAX_MOCKUPS_PER_TURN = 2;
/** A model id as OpenRouter writes it, e.g. google/gemini-3.1-flash-image. */
export const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/;

// ---- the draft stored in ai_drafts.payload -------------------------------------------------------------------------

export const factsSchema = z.object({ fileName: z.string(), format: z.enum(["stl", "3mf"]), sizeMm: z.tuple([z.number(), z.number(), z.number()]).nullable(), triangles: z.number().nullable(), filaments: z.array(z.string()) });

/** One message in the studio chat. `photos` are real-print photos attached to it, `model` a 3D file, `images` the mockups it produced, `proposals` the ids of changes to the product it proposed (approved one by one, see lib/ai/agent/apply.ts). */
export const chatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(6000),
  photos: z.array(z.string()).max(MAX_PHOTOS_PER_DRAFT).default([]),
  model: z.string().nullable().default(null),
  images: z.array(z.string()).max(MAX_IMAGES_PER_DRAFT).default([]),
  proposals: z.array(z.string()).max(20).default([]),
  at: z.string().default(""),
});
export type ChatTurn = z.infer<typeof chatTurnSchema>;
export const MAX_CHAT_TURNS = 100;

export const draftSchema = z.object({
  /** The 3D file, once one is attached. */
  modelKey: z.string().nullable().default(null),
  photoKeys: z.array(z.string()).max(MAX_PHOTOS_PER_DRAFT).default([]),
  notes: z.string().max(1500).default(""),
  facts: factsSchema.nullable().default(null),
  copy: copySchema.nullable().default(null),
  price: z.string().max(20).default(""),
  images: z.array(z.object({ key: z.string(), scene: z.enum(IMAGE_SCENES), extra: z.string().default(""), model: z.string().default("") })).max(MAX_IMAGES_PER_DRAFT).default([]),
  chat: z.array(chatTurnSchema).max(MAX_CHAT_TURNS).default([]),
  costUsd: z.number().default(0),
  /** The product this chat is about. Null until "Create product" (a new product); set from the start for an existing one. One open chat per product. */
  productId: z.string().nullable().default(null),
  /** Picture keys already added to the product (never added twice, never deleted by the chat). */
  attached: z.array(z.string()).max(40).default([]),
});
export type DraftPayload = z.infer<typeof draftSchema>;
