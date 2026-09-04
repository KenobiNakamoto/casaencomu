import { createRemoteJWKSet } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth";

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
  if (!team || !audience) {
    return NextResponse.json(
      { error: "auth misconfigured: CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD must be set" },
      { status: 500 },
    );
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
