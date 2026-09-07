import { createRemoteJWKSet } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { previewEmail, verifyAccessToken } from "@/lib/auth";

// ponytail: jose over hand-rolled RS256 — security path, keep the dep
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });

export async function proxy(request: NextRequest) {
  // Always overwritten: an incoming x-user-email is never trusted.
  const forward = (email: string) => {
    const headers = new Headers(request.headers);
    headers.set("x-user-email", email);
    return NextResponse.next({ request: { headers } });
  };

  // Dev bypass: only in `next dev` and only when AUTH_DEV_EMAIL is set.
  // `process.env.NODE_ENV` is inlined at build time, so this branch is dead code in production.
  if (process.env.NODE_ENV === "development" && process.env.AUTH_DEV_EMAIL) {
    return forward(process.env.AUTH_DEV_EMAIL);
  }

  const team = process.env.CF_ACCESS_TEAM_DOMAIN;
  const audience = process.env.CF_ACCESS_AUD;

  // Preview mode: a shared password, for the Air behind Tailscale while the Access
  // deploy waits on its owner-only items. Cloudflare wins when it is configured, so
  // a stray PREVIEW_PASSWORD can never downgrade a real deployment.
  if (!team || !audience) {
    const password = process.env.PREVIEW_PASSWORD;
    if (!password) {
      return NextResponse.json(
        { error: "auth misconfigured: set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD, or PREVIEW_PASSWORD" },
        { status: 500 },
      );
    }
    const email = await previewEmail(request.headers.get("authorization"), password);
    return email
      ? forward(email)
      : new NextResponse("Escribe tu nombre y la clave de la casa.", {
          status: 401,
          headers: { "www-authenticate": 'Basic realm="CasaEnComu", charset="UTF-8"' },
        });
  }

  const token =
    request.headers.get("cf-access-jwt-assertion") ?? request.cookies.get("CF_Authorization")?.value;
  if (!token) return unauthorized();

  try {
    jwks ??= createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
    const email = await verifyAccessToken(token, { jwks, issuer: `https://${team}`, audience });
    return forward(email);
  } catch {
    return unauthorized();
  }
}

export const config = {
  // Exempt: the health probe, Next's own assets, the favicon.
  matcher: ["/((?!api/health|_next/|favicon.ico).*)"],
};
