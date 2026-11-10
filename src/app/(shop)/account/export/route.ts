import { getCurrentUser } from "@/lib/session";
import { exportUserData } from "@/lib/privacy";

/** Right of access (RA 10173): download everything we hold about the signed-in user as JSON. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const data = await exportUserData(user.id);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="darl-creates-my-data.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
