import { redirect } from "next/navigation";

/**
 * The way out, whichever door you came in by.
 *
 * Behind Cloudflare Access there is a session to end, and Cloudflare ends it — its own logout URL
 * clears `CF_Authorization` and nothing here can. In preview mode the door is Basic authentication,
 * which has no session at all: a 401 with the challenge makes the browser forget the credential it
 * has been repeating and ask again, which is as close to signing out as that door gets.
 */
export function GET() {
  const team = process.env.CF_ACCESS_TEAM_DOMAIN;
  if (team) redirect(`https://${team}/cdn-cgi/access/logout`);
  return new Response("Has salido. Cierra esta pestaña o vuelve a entrar.", {
    status: 401,
    headers: {
      "www-authenticate": 'Basic realm="CasaEnComu", charset="UTF-8"',
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
