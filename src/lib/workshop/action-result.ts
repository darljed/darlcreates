/**
 * The result shape of the workshop Server Actions. They return `{ ok: false, error }` instead of throwing, because production
 * builds hide the message of a thrown error from the browser.
 */
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const fail = (e: unknown, fallback = "Something went wrong"): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error && e.message ? e.message : fallback,
});
