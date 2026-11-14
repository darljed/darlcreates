/**
 * Run an async job once and keep its result, but NOT its failure: if it fails, the next call tries again. Used for loading the
 * fonts on the server, so one failed read does not break design checks and print files until the server restarts. Pure.
 */
export function retryable<T>(job: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | null = null;
  return () => {
    if (!cached) {
      const attempt = job();
      cached = attempt;
      attempt.catch(() => {
        if (cached === attempt) cached = null; // forget a failure so the next call can try again
      });
    }
    return cached;
  };
}
