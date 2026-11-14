"use client";

/**
 * Registers the service worker (public/sw.js) in production so the site is installable and shows an offline page.
 * In development it removes any worker left behind, so a stale one can't serve old files while coding.
 */
import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      /* private mode or blocked: the site works the same without it */
    });
  }, []);
  return null;
}
