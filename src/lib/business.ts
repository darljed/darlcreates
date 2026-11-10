/**
 * Business identity shown on customer documents. Env-overridable so the owner can change it
 * without a deploy. NOTE: wording of the Order Acknowledgment is a legal-adjacent choice:
 * the business is not BIR-registered, so documents must never be titled or described as an
 * "Official Receipt" or tax invoice. Have the owner/accountant review before launch.
 */
export const BUSINESS = {
  name: process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "Darl Creates",
  tagline: "Custom 3D printing",
  contactEmail: process.env.NEXT_PUBLIC_BUSINESS_EMAIL ?? "darljedmatundan@gmail.com",
  location: "Philippines",
} as const;

/** Bump when the privacy policy changes in a way users must re-accept. */
export const PRIVACY_VERSION = "2026-11-10";
