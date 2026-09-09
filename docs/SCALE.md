# CasaEnComú — from one family to many

_2026-09-09. This file answers one question: **what does the backend look like if more than one
family uses this app?** `STATUS.md` holds the state of the whole project; `PLAN.md` holds what v1
ships and what is deliberately cut._

**Built (issue #123): § 4, the silo.** One SQLite file per project, and the membership check at
the one function that hands out a connection. Everything else here is still a design.

---

## 1. The short answer

| Question | Answer | State |
|---|---|---|
| Four people, four emails, one home search | **Already built. Deploy it.** Cloudflare Access is the login and the allowlist | waiting on #1, #2, #5 |
| Many families, each with their own search | **One SQLite file per family.** No schema change, no query change | **built, issue #123** |
| Who they log in as | **Cloudflare Access, with an open policy.** Access does the Google login; the app decides who belongs where | next |
| Creating a project, inviting people | The control database is there; the pages and the invitation are not | next |
| Where it runs | **One small server**, running the container that exists today | when strangers arrive |
| Supabase | **No.** It replaces a database that works and costs a full rewrite of 72 queries | — |
| Vercel | **No.** It breaks three things the app depends on, and the app still needs a server | — |

The order of work is § 8. The first step is not code. It is the three items in `STATUS.md` § 6.

---

## 2. Four facts about today's code that decide everything

Read these before you disagree with § 1.

1. **Authentication is one HTTP header.** `src/proxy.ts` verifies the Cloudflare Access token and
   sets `x-user-email`. `currentUser()` reads that header and nothing else. To change the login
   method, change two files. No page and no component knows how a person signed in.
2. **The database is one file, and the client also speaks to a remote server.**
   `@libsql/client` takes `file:./data/casa.db` today. The same client takes `libsql://…` for a
   hosted database. That door stays open at no cost.
3. **The app needs a real computer, and this is not negotiable.** Two parts run outside the
   container and need a host: `scripts/capture-agent.mjs` drives a real Chrome, because Idealista
   refuses a server; `scripts/ai-bridge.mjs` uses the Claude Code CLI and its keychain. Photos are
   files on a disk. Two loops run inside the web process on timers.
4. **Every query is raw SQL, written by hand, in 14 files, at 72 call sites.** There is no ORM and
   no data-access layer. Any change that rewrites the SQL is expensive. Any change that leaves the
   SQL alone is cheap. This is the test that decides § 4 and § 7.

---

## 3. Step one — the family of four. Nothing to build

The app already supports four people with four emails, collaborating on one search:

- Cloudflare Access holds the four emails. That list **is** the allowlist. There is no sign-up.
- A member signs in with Google or with an email PIN. Cloudflare offers both. No code.
- On the first visit, `currentUser()` creates the `users` row from the email.
- Ratings, comments, stage changes and the activity feed are all attributed per person, today.

**The only reason the four identities are not separate right now** is the preview: `PREVIEW_OPEN_AS`
serves every visitor as one person, because the preview has no login. The Access deployment fixes
that and needs no code.

So the work for the family is issues **#1, #2, #5 → #18 → #19**. All of it is in `STATUS.md` § 6,
and all of it is Kenobi's hand plus one agent on the server.

**Do not build a login for the family.** Cloudflare Access does the whole job for nothing.

---

## 4. Step two — many families: one database per family

### The decision

Give every family its own SQLite file. Do not add a `project_id` column.

```
/data
  control.db                 accounts, projects, memberships, invites
  p/<project-id>/casa.db     today's eight tables, unchanged
  p/<project-id>/photos/…    today's photo store, unchanged
```

### Why this and not a tenant column

A `project_id` column means every one of the 72 queries grows a `WHERE project_id = ?`. Miss one
and a family sees another family's home. It also breaks two unique constraints:
`sources.url_normalized` is globally unique, and so is `(portal, portal_ref)`. Two families are
certain to save the same flat. Both indexes would have to be rebuilt around the tenant.

One file per family changes none of that. The isolation is the filesystem, not a `WHERE` clause.
A query that forgets its tenant is not possible, because the connection **is** the tenant.

It also gives four things for free:

| Want | Cost |
|---|---|
| Delete a family's data (GDPR erasure) | `rm -rf p/<id>` |
| Export a family's data | copy one file |
| Back up one family | the backup script, once per file |
| Move a heavy family to its own machine | copy the directory |

### What it cost to build

`src/lib/db.ts` exports a module-level `db`. Keep that name. Make it a proxy that finds the right
client in `AsyncLocalStorage`. Then **all 72 call sites stay exactly as they are.**

```ts
// sketch, ~20 lines in db.ts
const tenant = new AsyncLocalStorage<string>();
const clients = new Map<string, Client>();          // ponytail: unbounded; LRU when it hurts

function client() {
  const id = tenant.getStore();
  if (!id) throw new Error("no project in scope");   // loud, never a silent wrong tenant
  let c = clients.get(id);
  if (!c) { c = createClient({ url: `file:${DATA_DIR}/p/${id}/casa.db` }); clients.set(id, c); }
  return c;
}

export const db = {
  execute: (s: InStatement) => client().execute(s),
  batch: (s: InStatement[], m?: TransactionMode) => client().batch(s, m),
  executeMultiple: (s: string) => client().executeMultiple(s),
};

export const inProject = <T>(id: string, fn: () => Promise<T>) => tenant.run(id, fn);
```

The work was only these places:

| File | Change |
|---|---|
| `src/lib/control.ts` | new. `projects`, `memberships`, `capture_tokens`, and the resolution rules |
| `src/lib/db.ts` | the router above, and `resolveProject()` — the membership check |
| `src/lib/photos.ts`, `src/lib/enrich.ts` | `photoPath()` takes the project |
| `src/app/api/photos/[id]/route.ts` | passes the project to `photoPath()` |
| `src/app/api/capture/**` | a capture token names its project; the handler runs inside it |
| `src/instrumentation.ts` | the two loops walk the project list, each pass inside `inProject()` |
| `air/casaencomu-backup.sh` | one archive a night: `control.db` plus one file per project |

`src/proxy.ts` did **not** change. It still only says who you are. Which project you may open is
decided at the database, not at the edge, because that is the one place no page can skip.

**Nothing in `src/app/**/page.tsx` or `src/components/**` changes.** That matters while two other
agents own those files.

### How the app knows which project

The cookie, as recommended below. Two options were weighed:

- **In the path** — `/p/<slug>/propiedades`. Shareable, unambiguous, and a person can hold two
  searches open in two tabs. Cost: every internal link changes, which is every page and component.
- **In a cookie** — set on sign-in, changed by a switcher in the header. Zero URL changes, zero
  page changes. Cost: a link no longer says which search it belongs to.

**The cookie won.** It is the whole feature for about ten lines, and it changed no page and no
component — which matters while two other agents own those files. Move to the path when somebody
needs to send a link across two searches; that is the trigger.

The cookie is a *preference*, never a permission. `resolveProject()` honours it only when the
person is a member; otherwise it falls back to their own first project. Proven end to end: with a
stranger's identity and the family's project id in the cookie, the list showed 0 of 23 homes, a
photograph answered 404, and a listing page said «no existe».

### The control database

One more SQLite file, four tables. This one is shared, because it is what maps a person to their
searches.

```sql
CREATE TABLE projects       (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE memberships    (project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                             email TEXT NOT NULL, created_at TEXT NOT NULL,
                             PRIMARY KEY (project_id, email));
CREATE TABLE capture_tokens (token TEXT PRIMARY KEY,
                             project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                             email TEXT NOT NULL);
```

**There is no `accounts` table, and that is deliberate.** The identity is the email address, which
is what Cloudflare Access and Google both hand us. An `accounts` row would only be an id standing
in for an email that cannot change, and the project's own `users` table already holds the name.
Add one the day an account needs data of its own.

`capture_tokens` is the index that says which project a bookmarklet opens. The project's `users`
table is still the authority for the token itself; a capture arrives from a portal's page with no
session, so the token is all there is to go on.

`invites` and a `role` column belong to the next issue, and they are not here yet: a table nothing
reads is scaffolding.

The per-family `users` table stays exactly as it is. It is created from the email on first sight,
which is what `currentUser()` already does. So every foreign key in `ratings`, `comments` and
`events` keeps working with no migration at all.

### When one file per family stops being right

Write this ceiling down now, so nobody argues about it later:

- **Boot time.** Every project's migration chain runs at start-up. At a few thousand files that
  is slow. Fix: migrate on first use, not at boot.
- **Open handles.** One client per active project. Fix: an LRU that closes the cold ones.
- **A question across all families** — "how many flats did everyone save this month". This needs a
  script that walks the files. That is fine for a report and wrong for a dashboard.

The real trigger for one shared Postgres with a `project_id` column is **a question you must ask
across tenants, in a page, live**. Not tenant count. Until then, files win.

---

## 5. Step three — a login that lets a stranger in

Access is right for a fixed list of family members: the policy names four emails and nobody else
gets through. That is also why invitations cannot work under it as configured — an invited person
is refused at Cloudflare before the app ever sees them, so somebody would have to edit a Zero
Trust policy for every new member.

**The lazy fix is a setting, not code.** Change the Access policy from "these four emails" to
"anyone who signs in with Google", and Access becomes only the identity provider. It still proves
who you are, over the same tunnel, with the same cookie the app already verifies. **The app then
decides what you may see**, which is exactly what `memberships` now does — and a person with no
membership lands in a project of their own, holding nothing.

So the whole authorisation model is already built, and the login needs no new code at all.

| | Cloudflare Access, open policy | Google Sign-In in the app |
|---|---|---|
| Code | none | about 120 lines |
| Who can reach the app | anyone with a Google account | the same |
| Who sees a project | `memberships` | `memberships` |
| Ceiling | Access's free tier is 50 seats; every visitor goes through Cloudflare | none |

**Do the first. The trigger for the second is the 50-seat limit, or leaving Cloudflare.** When it
fires, `jose` is already installed and `proxy.ts` already calls `createRemoteJWKSet`, which is
exactly what verifying a Google token needs: redirect, exchange the code, verify the `id_token`,
require `email_verified`, sign a session cookie. Four routes and the same one seam.

**Why not Auth.js, Clerk, Auth0 or Supabase Auth.** Each is a dependency, a hosted account and a
migration, to solve one OAuth flow against one provider. The app stores no password, has no reset
flow and no second provider. Add a library when a second provider or SAML arrives.

**Never store a password.** No hashing, no reset emails, no lockout. Google holds the identity.

---

## 6. Step four — projects, members and invitations — **built**

Two pages, one actions file, and four tables. Everything below is in the repository and checked.

- **Start a project.** «Empezar otro proyecto» on `/proyectos`. A name, and you own it. A person
  with no project still gets one made for them; the page makes it deliberate instead.
- **Switch project.** «Tus proyectos» on the same page writes the `casa_p` cookie. The cookie is a
  preference, not a permission: `resolveProject()` checks the membership again on every request,
  so a cookie for somebody else's project is ignored. Two projects can carry the same name, so a
  project that is not yours says whose it is.
- **Invite.** Type an address. `createInvite()` writes a row: a random token, the project, the
  address, who invited, and a date 14 days out. Pressing the button twice returns the same link.
- **Send.** **The app shows the link and the owner sends it** — WhatsApp, or wherever the family
  already talks (Kenobi, 2026-09-09). No mail server, no deliverability, no bounce handling. Send
  real email when somebody asks; the token and the page do not change.
- **Accept.** `/invitacion/<token>` says who invited you and to what, and does nothing until the
  button is pressed — a link that joins by being opened would be joined by the first chat app that
  makes a preview of it. **The signed-in address is the evidence; the address in the link is only
  a claim.** A link opened by anybody else is refused, in words, with no button. So is one already
  used, one past its date, and one the owner has withdrawn.
- **Roles.** `memberships.role` is `owner` or `member`.
  - **Owner** — the person who started the project. Invites, withdraws an invitation, and removes
    a member. An owner is never removed: the project would be left with nobody who can manage it.
  - **Member** — sees exactly the same list of people, and no buttons. Knowing who can read your
    search is not the same as being able to change it.
  - The rule is in `mustOwn()`, which throws, and every function that changes who is in a project
    calls it first. It is not in the page, so a page cannot forget it.
- **Removing somebody takes their bookmarklet with them.** The `capture_tokens` row goes in the
  same write. Otherwise their bookmark keeps posting listings into a project they are out of.
- **Members page.** `/proyectos` is it. Not an administration panel over every tenant — that is a
  different product and needs its own access decision.

Skipped, and when to add it: **making a second owner** (one family, one owner is enough; add it
when an owner loses their account), **renaming or deleting a project** (nobody has asked),
**leaving a project** (the owner removes you), and **real email**.

---

## 7. Where it runs, and the two platforms Kenobi named

### The recommendation: one small server, the container that already exists

Hetzner (about €4 per month) or Fly.io (about €5 to €10). The image, the compose file and
`deploy.sh` all work as they are. A volume holds `/data`. The two loops keep running. The photos
stay on disk. `capture-agent.mjs` and `ai-bridge.mjs` get a home.

One server holds hundreds of families on SQLite without complaint. This is not a compromise; it
is the correct size for the load.

### Vercel — no, and here is the specific cost

Vercel is excellent for Next.js and wrong for this app. It would force three rewrites:

| What Vercel does not have | What has to change |
|---|---|
| A disk that survives a request | `photos.ts` and the photo route move to object storage |
| A process that lives between requests | the recheck loop and the fill loop become cron routes |
| A local database file | every query becomes a network round-trip to a hosted database |

The third is the expensive one. A page here runs several small queries against a local file, which
is free. Over a network each one is a round-trip.

And after all three, **you still need a server**, because the browser capture agent needs a real
Chrome and the AI bridge needs a keychain. Vercel does not remove the machine. It adds a second
thing to operate.

**Cron on Vercel is genuinely good**, and it is the one piece worth copying: make the two loops
callable as authenticated routes, so any scheduler can drive them. That is a small change and it
is useful on a plain server too.

### Supabase — no, for now

Supabase gives Postgres, auth, storage and row-level security in one account. Three of those four
are things this app already has or does not need:

- The 72 hand-written queries are SQLite. Postgres is a **port**, not a switch: `json_extract`,
  `INSERT OR IGNORE`, `PRAGMA user_version` and the migration chain all change.
- Row-level security protects a database that a browser talks to directly. This app is
  server-rendered; a browser never sees the database. The main thing you buy does not apply.
- Storage and auth are each replaceable by ten lines, as § 5 shows.

**The trigger for Postgres is real and worth naming:** a second process that writes. Today one
container writes, which is why SQLite is safe. The day there is a worker container, or two web
containers behind a load balancer, SQLite is the wrong answer and Postgres is the right one.
Supabase is then a good way to get it.

### Turso, if the app must leave one machine

`@libsql/client` speaks `libsql://` with the same API, and Turso sells database-per-tenant as a
product. So § 4's design keeps that exit open: the file path becomes a URL and nothing else
changes. Do not do it before it is needed. A local file is faster than any network.

---

## 8. The order of work

1. **Deploy the family** — issues #1, #2, #5, then #18, #19. No code. This is the only urgent step,
   because the app is finished and nobody is using it.
2. ~~**One database per family**~~ — done, issue #123.
3. **Projects, members and invitations** — § 6. About a day, and it is mostly pages.
4. **Open the Access policy** — § 5. A setting, not code. Do it with step 3.
5. **Move the server**, if strangers will ever use it. Same image, a small server, a volume.
6. **Anything else**: billing, Google Sign-In, Postgres, object storage. Each waits for a trigger
   named above.

## 9. Two things that are not engineering

Both matter more than the architecture if this is ever sold.

- **The portals.** A private family tool that reads advertisements a member opened is one thing.
  A commercial product built on Idealista's listings is another, and Idealista blocks servers on
  purpose. The rule "never bypass anti-bot or CAPTCHA" is what keeps the current design honest,
  and it is also the thing that limits the product. Get an opinion on this before charging money.
- **Personal data.** Today the family's emails live in Cloudflare and in one `users` table. With
  customers, the app holds other people's data in the EU. That means a privacy notice, a lawful
  basis, deletion on request and a named controller. The one-file-per-family design makes deletion
  and export trivial, which is the part that is usually hard.
