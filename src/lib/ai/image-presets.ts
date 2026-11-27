/**
 * The image prompts: pure constants and string builders, safe for the browser and free of the 3D-file readers (they live
 * in the rest of product-copy). Server code re-exports this, the admin image gallery imports it directly.
 */
import { type Scene } from "./draft-types";

/** The owner never wants tax or business-registration status in the shop's words (docs/decisions). */
const KEEP = "The attached photo(s) show the REAL 3D-printed product. Keep its exact shape, proportions, colours, surface texture and layer lines. Do not add, remove or restyle any feature. Do not add text, logos, watermarks, price tags or people's faces.";

const SCENE_PROMPT: Record<Scene, string> = {
  hero: "Create a clean e-commerce hero photo of this exact product on a seamless light backdrop with soft studio lighting and a gentle natural shadow. The product is centred and fills about 70% of the frame.",
  lifestyle: "Create a realistic lifestyle photo showing this exact product in natural use or on display in a fitting everyday setting (a desk, a bag, a shelf, a hand). Soft daylight, shallow depth of field, the product is the clear subject.",
  detail: "Create a macro close-up of this exact product that shows its printed texture and finish in sharp focus, with a softly blurred neutral background.",
};

/** Prompt for one chat scene (hero / lifestyle / detail) or the owner's own words. */
export function imagePrompt(scene: Scene, name: string, extra = ""): string {
  return [`${SCENE_PROMPT[scene]} The product is "${name}".`, KEEP, extra.trim() ? `Extra direction from the owner: ${extra.trim().slice(0, 300)}` : ""].filter(Boolean).join("\n\n");
}

/** A mockup described in the owner's (or the chat assistant's) own words. The real product must still stay unchanged. */
export function customImagePrompt(direction: string, name: string): string {
  return [`${direction.trim().slice(0, 500)}\n\nThe product is "${name}".`, KEEP].join("\n\n");
}

/** The one-click presets, in the order the image gallery's chips show them. */
export const IMAGE_PRESETS = ["cover", "studio", "lifestyle", "detail", "custom"] as const;
export type ImagePreset = (typeof IMAGE_PRESETS)[number];

export const IMAGE_PRESET_LABEL: Record<ImagePreset, string> = {
  cover: "Cover",
  studio: "Studio",
  lifestyle: "Lifestyle",
  detail: "Detail",
  custom: "Custom",
};

export const IMAGE_PRESET_HINT: Record<ImagePreset, string> = {
  cover: "A cover image with the product's name as a clean text overlay.",
  studio: "A clean hero shot on a light studio backdrop.",
  lifestyle: "The product in real use, on a desk or in a hand.",
  detail: "A macro close-up of the printed texture and finish.",
  custom: "Your own description of the shot.",
};

/** The standard set the "Generate set" button makes in one go. */
export const GENERATE_SET: ImagePreset[] = ["cover", "studio", "lifestyle"];

/** A cover wants its name as text, so it cannot use the shared scene prompts: their guard forbids any text on the image. */
export function coverPrompt(name: string, extra = ""): string {
  return [
    `Create an eye-catching e-commerce cover image of this exact product, centred and clearly the subject.`,
    `Overlay the product name "${name}" on the image as large, clean, easy-to-read text that fits the design (plain words, no gibberish). Leave a safe margin around the text.`,
    extra.trim() ? `Extra direction from the owner: ${extra.trim().slice(0, 300)}` : "",
  ].filter(Boolean).join("\n\n");
}

/** The prompt for one image-studio preset. The scene prompts already carry the guard that keeps the real product unchanged. */
export function studioImagePrompt(preset: ImagePreset, name: string, direction: string): string {
  if (preset === "cover") return coverPrompt(name, direction);
  if (preset === "custom") return customImagePrompt(direction || "A clean, attractive product photo.", name);
  const scene: Scene = preset === "studio" ? "hero" : preset;
  return imagePrompt(scene, name, direction);
}
