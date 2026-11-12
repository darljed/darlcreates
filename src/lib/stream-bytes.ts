/**
 * A byte array as a streamed response body. Vercel limits a normal (buffered) function response to 4.5 MB, but not a
 * streamed one, and a print file for a heavy model is larger than that. Streaming in chunks also lets the browser start
 * saving at once.
 */
export function bytesToStream(bytes: Uint8Array, chunkSize = 64 * 1024): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(at, Math.min(at + chunkSize, bytes.length)));
      at += chunkSize;
    },
  });
}
