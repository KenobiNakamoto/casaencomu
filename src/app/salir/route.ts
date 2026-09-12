import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, endSession } from "@/lib/accounts";

/**
 * The way out, whichever door you came in by.
 *
 * Our own session goes first, and it goes properly: the row is deleted, so the cookie still in the
 * browser names nothing and opens nothing. Only then does the door in front of the app matter.
 *
 * Behind Cloudflare Access there is a second session to end, and Cloudflare ends it — its own
 * logout URL clears `CF_Authorization` and nothing here can. In preview mode the door is Basic
 * authentication, which has no session at all: a 401 with the challenge makes the browser forget
 * the credential it has been repeating and ask again, which is as close to signing out as that
 * door gets.
 */
export async function GET() {
  const jar = await cookies();
  await endSession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);

  const team = process.env.CF_ACCESS_TEAM_DOMAIN;
  if (team) redirect(`https://${team}/cdn-cgi/access/logout`);
  if (process.env.PREVIEW_PASSWORD || process.env.PREVIEW_OPEN_AS) {
    return new Response("Has salido. Cierra esta pestaña o vuelve a entrar.", {
      status: 401,
      headers: {
        "www-authenticate": 'Basic realm="CasaEnComu", charset="UTF-8"',
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }
  redirect("/entrar");
}
