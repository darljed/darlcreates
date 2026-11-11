"use client";

/**
 * "Install app" link for the footer. Chrome/Edge/Android give us a real install prompt (beforeinstallprompt); Safari
 * on iPhone has none, so there we show the two-step instruction instead. Hidden once the app is installed/standalone.
 */
import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function InstallApp() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(true); // true until we know, so nothing flashes
  const [help, setHelp] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
    /* eslint-enable react-hooks/set-state-in-effect */
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    const onInstalled = () => setStandalone(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone || (!evt && !ios)) return null;
  return (
    <div className="text-xs">
      <button
        type="button"
        className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
        onClick={async () => {
          if (evt) {
            await evt.prompt();
            setEvt(null);
          } else setHelp((h) => !h);
        }}
        aria-expanded={evt ? undefined : help}
      >
        <Download className="size-3.5" aria-hidden /> Install the app
      </button>
      {help && <p className="mt-1 text-muted-foreground">Tap the Share button, then &ldquo;Add to Home Screen&rdquo;.</p>}
    </div>
  );
}
