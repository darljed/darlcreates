/**
 * Business identity shown on customer documents (the Order Acknowledgment). Env-overridable so the owner can
 * change it without a deploy.
 */
export const BUSINESS = {
  name: process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "Darl Creates",
  tagline: "Your 3D printing partner",
  contactEmail: process.env.NEXT_PUBLIC_BUSINESS_EMAIL ?? "darljedmatundan@gmail.com",
  location: "Philippines",
} as const;

// The privacy policy text and its version now live in the DB (Admin > Legal pages); see
// getPrivacyVersion() in site-content.ts. Tick "ask everyone to accept again" to re-ask customers.
