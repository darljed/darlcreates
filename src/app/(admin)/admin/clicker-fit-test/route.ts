import { requireAdmin } from "@/lib/session";
import { buildFitTest } from "@/lib/clicker/server";
import { bytesToStream } from "@/lib/stream-bytes";

/**
 * Admin-only: the clicker fit-test plate (four bases with a tighter or looser switch pocket, four keys with a tighter or
 * looser stem socket) as a 3MF. Print it once per printer and filament, then set "Printer fit" on the clicker product.
 */
export async function GET() {
  await requireAdmin();
  const { file } = await buildFitTest();
  return new Response(bytesToStream(file), {
    headers: { "Content-Type": "model/3mf", "Content-Disposition": 'attachment; filename="clicker-fit-test.3mf"', "Cache-Control": "private, no-store" },
  });
}
