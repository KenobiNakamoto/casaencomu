// Every request the server makes to the outside goes through here (F38).

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const MAX_HOPS = 3;

export type Refusal = "scheme" | "credentials" | "port" | "host" | "redirects" | "too_big";

/**
 * The four rules a URL must pass: https, no embedded credentials, default port, host on the
 * caller's allowlist. Applied to the first URL **and to every redirect target before the hop is
 * taken**, which is the part `redirect: "follow"` cannot do — an allowed portal that answers
 * with a redirect somewhere else is refused, not fetched.
 */
export function refuse(url: string, allow: (url: string) => boolean): Refusal | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "host";
  }
  if (u.protocol !== "https:") return "scheme";
  if (u.username || u.password) return "credentials";
  if (u.port) return "port";
  if (!allow(url)) return "host";
  return null;
}

export type Fetched = {
  status: number;
  /** The last URL actually fetched. The portals signal a withdrawn ad in it. */
  finalUrl: string;
  contentType: string;
  body: Buffer;
  /** The response was longer than `maxBytes` and was cut. Never parsed as a listing. */
  truncated: boolean;
};

/** Reads at most `maxBytes`, then cancels. Works when the server sends no `content-length`. */
async function readCapped(res: Response, maxBytes: number): Promise<{ body: Buffer; truncated: boolean }> {
  if (Number(res.headers.get("content-length")) > maxBytes) {
    await res.body?.cancel();
    return { body: Buffer.alloc(0), truncated: true };
  }
  const reader = res.body?.getReader();
  if (!reader) return { body: Buffer.alloc(0), truncated: false };
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > maxBytes) {
      await reader.cancel();
      return { body: Buffer.concat(parts), truncated: true };
    }
    parts.push(value);
  }
  return { body: Buffer.concat(parts), truncated: false };
}

/**
 * One guarded GET. Redirects are followed by hand, at most three, each target checked first.
 * Returns the refusal instead of the response when a rule fails; throws only on a network error
 * or a timeout, as `fetch` does.
 */
export async function fetchGuarded(
  url: string,
  opts: {
    allow: (url: string) => boolean;
    maxBytes: number;
    timeoutMs: number;
    /** The caller's overall deadline, when it has one. Whichever fires first wins. */
    signal?: AbortSignal;
    accept?: string;
  },
): Promise<Fetched | { refused: Refusal }> {
  const own = AbortSignal.timeout(opts.timeoutMs);
  const signal = opts.signal ? AbortSignal.any([own, opts.signal]) : own;
  let target = url;

  for (let hop = 0; ; hop++) {
    const bad = refuse(target, opts.allow);
    if (bad) return { refused: bad };

    const res = await fetch(target, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "es-ES,es;q=0.9",
        ...(opts.accept ? { Accept: opts.accept } : {}),
      },
      redirect: "manual",
      signal,
    });

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      if (hop >= MAX_HOPS) return { refused: "redirects" };
      target = new URL(location, target).toString();
      continue;
    }

    const { body, truncated } = await readCapped(res, opts.maxBytes);
    return {
      status: res.status,
      finalUrl: target,
      contentType: res.headers.get("content-type") ?? "",
      body,
      truncated,
    };
  }
}
