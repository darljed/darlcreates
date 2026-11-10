"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { recordConsent } from "@/lib/privacy";
import { safeRedirect } from "@/lib/safe-redirect";
import { getPrivacyVersion } from "@/lib/site-content";

/** Records acceptance of the current privacy policy, then returns the user where they were going. */
export async function acceptConsentAction(formData: FormData) {
  const user = await getCurrentUser(); // not requireUser(): that would redirect back here forever
  if (!user) redirect("/sign-in");
  if (formData.get("agree") !== "on") redirect(`/consent?error=1&redirect=${encodeURIComponent(safeRedirect(String(formData.get("redirect") ?? "/")))}`);
  await recordConsent(user.id, await getPrivacyVersion());
  redirect(safeRedirect(String(formData.get("redirect") ?? "/")));
}
