"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * While an advertisement has not been read yet, the page checks back by itself. The reader on the
 * host, or the fill layers, usually answer within seconds, and a page that never changed would
 * look broken. It gives up after `stopAfterMs`: by then nobody is still watching.
 */
export function PendingPoll({ everyMs = 5_000, stopAfterMs = 180_000 }: { everyMs?: number; stopAfterMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => {
      if (Date.now() - started > stopAfterMs) clearInterval(t);
      else router.refresh();
    }, everyMs);
    return () => clearInterval(t);
  }, [router, everyMs, stopAfterMs]);
  return null;
}
