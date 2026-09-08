# CasaEnComú — what is done, and what is not

_2026-09-08. This file answers one question: **what is the real state right now?**
`WORKPLAN.md` holds the plan and the order. This holds the state. When they disagree, this one
is newer — check the dates._

Every claim below names the pull request, the issue, or the command that proves it. A line with
no evidence is not a claim, it is a plan, and it belongs in `WORKPLAN.md`.

---

## 1. In one paragraph

**Release A is finished.** All seven of its packages are merged, along with the preview
authentication and three follow-up fixes: `main` is green at **336 tests, 3 skipped**, with lint,
types and build clean. **Release B has not been started** — six packages, none of them begun.
Nothing is deployed to a real domain, because three items only Kenobi can do are still open. To
let him look at the app anyway, it runs on the Air, reachable over Tailscale, behind a shared
password. That preview is not the deployment.

---

## 2. What is running right now

| | |
|---|---|
| Where | The MacBook Air, in Docker under Colima |
| Reachable from | The tailnet only, over plain HTTP on port 8080 |
| Login | HTTP Basic. Any name, one shared password |
| Data | A **copy** of the Pro's development database: 23 properties, 621 photos |
| Survives a reboot | Yes, on its own |

The address, the password location and the exact commands are in `memory/decisions.md`
(2026-09-07). `memory/` is gitignored on purpose: the address names the machine.

**What this preview is not:**

- It is **not** the Cloudflare Access deployment. It has no domain and no Zero Trust policy.
- The shared password is **not** the perimeter. The tailnet is. The password only keeps the
  family's identities apart, so ratings and activity stay separate.
- The database on the Air is a **copy**. The Pro's `data/` is still the source of truth. Do not
  start editing on the Air and expect it to come back.
- It is **not** HTTPS. The tailnet has no HTTPS certificates enabled. Traffic is still
  WireGuard-encrypted between tailnet devices, and the application uses no browser feature that
  needs a secure context. See § 7 for the one-toggle upgrade.

---

## 3. Done and merged to `main`

`main` is green in the canonical checkout: **187 tests pass, 3 skip**; `eslint`, `tsc --noEmit`
and `next build` are all clean.

### The base application, before this round

Issues #6–#17, plus the two themes and the day/night toggle (#53), the generic-portal extractor
and the four bugs it exposed (#57), three more photo hosts (#59), the repository layout (#62)
and the cold-start fix (#64). `WORKPLAN.md` § 0 records that history.

**The database is real.** 23 of the family's 25 links are imported, every field taken from the
advertisement by the extractor. The two that fail are genuinely withdrawn.

### PIP-01 · Reliable import and recapture — issue #65, PR #66

- `fetching.ts`: one guarded fetch for every outbound request. HTTPS only, no credentials in the
  URL, no port, host allow-list, redirects checked **before** each hop, a byte cap that works
  without a `content-length`.
- A failed re-read no longer erases a field. `extract.ts` reports which fields were *present* in
  the page, and `save.ts` keeps the stored value for any field that was absent.
- `duplicate` is gone. Re-importing the same link now **refreshes** it and reports
  `created` / `updated` / `unchanged`.
- Photos are capped **per property**, not per call, and record the URL they came from, so a
  refresh cannot download the same photograph forever.

Verified against the real 23-property database: a second ingest added 0 events and 0 photos.

### PIP-03 · Tokens and accessible controls — issue #67, PR #68

- The full token table from the design document, in both themes.
- `globals.test.ts` computes **WCAG 2.2 contrast from the shipped stylesheet**, unrounded, and
  fails on any text pair below 4.5:1 or non-text pair below 3:1. It also asserts that the two
  night blocks are identical, and scans the source for banned patterns.
- A visible focus ring on every control, 44 px targets, and a `prefers-reduced-motion` block.
- `DESIGN.md` updated, as the proposal's instruction 7 requires.

### PIP-02 · Availability separate from the shared stage — issue #70, PR #71

**This one changed the data model.** Availability and the family's decision used to be the same
field, so a portal delisting a home wrote `no_disponible` over `preseleccionada` and the decision
was gone.

- Removal now needs **two consecutive scheduled checks that agree**. A block, a timeout or a
  success resets the streak. A manual check never casts the confirming vote.
- A property is as available as its **best** source. One portal still carrying it keeps it
  available.
- `recheck.ts` no longer writes `properties.stage` at all.
- Migration v3 **restores what was already lost**: only a member ever wrote a `stage_change`
  event, so the last one they wrote is exactly the decision that got buried.

Verified on a copy of the real database: a property staged `no_disponible` came back as
`preseleccionada`, 23 properties and sources intact.

### Preview auth — issue #72, PR #73

A third mode in `proxy.ts`, used **only** when the two Cloudflare Access values are absent.
Cloudflare wins when it is configured, so this can never weaken a real deployment. Details in
§ 2 above and in the PR.

### One fix — PR #69

`main` went red after the first two merges. `globals.test.ts` walked
`new URL(...).pathname`, which is percent-encoded; the worktrees are on an ASCII path so it
passed there, and the canonical checkout is under `Claude Projects/…/CasaEnComú`, so it became
`%20` and `%C3%BA`. Also excluded `node_modules.nosync` from `tsconfig.json`, because a bare
`tsc --noEmit` was type-checking all of `maplibre-gl`.

**The lesson is worth keeping: a worktree outside iCloud is not a faithful copy of the checkout
people actually use.** Run the checks in the canonical checkout before calling a branch green.

---

## 4. The rest of Release A — merged 2026-09-08

### PIP-04 · Stable, fully themed map — issue #75, PR #76

A vendored 55-layer style snapshot with a role manifest that **throws** on an unmapped layer, so
a light default can never ship silently again. The map is built once and repainted on a theme
change rather than rebuilt. Pins are buttons, so the keyboard reaches them.

### PIP-05 · One search and context contract — issue #78, PR #79

Four surfaces each decided which homes qualify and no two agreed. `src/lib/filters.ts` is now the
only place that answers it; two tests fail if either page grows a query of its own. `/api/markers`
was deleted — nothing called it. Also: one cover rule, one archive policy, links that carry every
filter, a detail page that returns to the list it came from, independent budget bounds, and labels
that say what the filters actually do.

Two older defects surfaced while verifying it: `ORDER BY created_at` ran on the outer statement
and failed for any caller that had not selected that column; and the budget fields rendered with a
corrupted `class` attribute, because a server component imported the shared field style from a
`"use client"` module. Building map markers field by field instead of spreading the row also took
the search haystack out of the browser — **the map page's payload fell from 76 KB to 30 KB**.

### Map popups keep the filters — issue #80, PR #81

PIP-05 could not touch `Mapa.tsx` while PR #76 owned it. Opening a home from a pin and pressing
back landed on an unfiltered list.

### PIP-06 · Usable comparison selection — issue #82, PR #83

`/comparar` accepted two to four identifiers and **nothing in the application selected them**;
the empty page asked a family member to compose a URL by hand. There is now a checkbox on every
card, row and detail page, outside the link rather than inside it, and a tray that states the
count, refuses a fifth without evicting anything, and says how many of the chosen homes the
filters are hiding. Differences are decided on raw typed values, so a rounded €/m² no longer hides
a real one. A phone shows two columns at a time without losing the other two.

### PIP-08 · Saving, errors, and purposeful motion — issue #84, PR #85

The add form threw the typed URL away on failure and posted Idealista links to a server fetch
that answers 403 every time. Links are now classified in the browser first, failures stay in a
native `<dialog>` with the URL still in the field, and there is one honest pending state. A stage
change carries the version it was drawn from, so two people deciding at once no longer means the
later write wins in silence — **verified: the refused write left the database untouched and wrote
no event**. A refused comment comes back with its text. `error.tsx`, `not-found.tsx` and
`loading.tsx` exist, so no flow reaches a framework default.

F18 needed no work: PIP-03 had already removed the card zoom and the pin scale under reduced
motion and cut the theme wipe from 520 ms to 320 ms. It is now covered by a test instead.

### Two defects of my own, found and fixed the same day

The comparison checkbox was positioned by a Tailwind utility that lost to `.compare-toggle`'s own
`position: relative` — same specificity, my rule later in the file — so it rendered above the card;
fixing that put it over the title. The card's photo and title are now separate links to the same
home, which is what document 02 § 4 asks for, so the control sits on the photograph without being
inside an anchor.

### `ingest.mts` credited a flag — issue #74, PR #86

`args[args.indexOf("--user") + 1]` reads `args[0]` when the flag is absent, so `--reset` owned all
23 import events in the Actividad feed. `vitest.config.ts` now also collects `scripts/**`.

---

## 5. Not done

### Release A — nothing left

All seven packages are merged. PIP-05 and PIP-06 were the two that PIP-01 to PIP-03 had unblocked;
PIP-08 was independent of them.

### Release B — none of it

PIP-07 (detail hierarchy), PIP-09 (review persistence), PIP-10 (opinion editor), PIP-11
(conversation), PIP-13 (activity and freshness), PIP-14 (profile and capture help).
**Not started.** Release B starts after Release A.

### Deferred by the proposal itself

PIP-12 (visits and tasks) and PIP-15 (manual fact corrections). These need new evidence and
Kenobi's approval before anyone writes code. Do not pick them up.

### PIP-16

Not a package to build once. It is the proof step run for each release. **Not yet run for
Release A**, because Release A is not finished.

---

## 6. Blocked, and on whom

**Three items. Only Kenobi can do them. They block the entire server track.**

| # | What | Where |
|---|---|---|
| 1 | A domain on Cloudflare DNS | dash.cloudflare.com |
| 2 | A Zero Trust account; note the team name | one.dash.cloudflare.com |
| 5 | Confirm the area and the member email list | never in the repo |

Behind them, in order: **#18** Air setup (needs the domain, the team domain, the Access AUD and
the member emails) → **#19** M1 integration → **#21** backup restore drill → **#20** phone
checklists.

**Nothing in the product track is blocked by these three.** That is why the product packages
went ahead, and why the Tailscale preview exists.

---

## 7. Open decisions for Kenobi

Each of these is small, and each one is his to make.

1. **Start Release B?** Six packages, in this order: PIP-07 (detail and listing hierarchy),
   PIP-09 (review persistence and fair aggregates), PIP-10 (opinion editor), PIP-11
   (conversation), PIP-13 (activity and freshness), PIP-14 (profile and help). PIP-09 is the one
   that matters most: the family score currently averages **rating rows**, so somebody who scored
   six dimensions has six times the weight of somebody who scored one (F21).
2. **Enable HTTPS certificates on the tailnet?** One toggle at the Tailscale admin console,
   DNS → HTTPS Certificates. It turns the preview into a real `https://` address with a valid
   certificate. Two minutes of work after that.
3. **Commit `docs/product-improvement/`.** The 16-package proposal is **in no commit**. It
   exists only as untracked files in this checkout. If this Mac is lost, so is it. See § 8.
4. **Signed commits.** About half of this repository's history is unsigned. Bcomm policy
   requires cryptographic signing on shared repositories. This is a private personal repository,
   so it may not apply, but the gap is real and should be a decision, not an accident.
5. **The three items that unblock a real deployment** — issues #1, #2 and #5. Nothing in the
   code is waiting on anything else. See § 6.

---

## 8. Known gaps and loose ends

These are real, and none of them is fixed.

- **`docs/product-improvement/` is untracked.** 16 packages, 40 findings, 12 decisions and 27
  validation cases, in no commit, on one machine.
- **The family score is not fair yet.** It averages rating rows, so a member who scored six
  dimensions outweighs one who scored a single dimension six to one. Finding F21, package PIP-09,
  not started. It is the largest correctness gap left in the product.
- **No layout above 960 px, and none below 768 px, has been seen in a browser.** The automation
  cannot change the layout viewport, so the desktop split view and every phone layout are covered
  by source assertions only. Where a phone branch mattered — the comparison pair view — it was
  exercised by pointing its media query at 4000 px temporarily, which proves the branch and not
  the breakpoint. **Do not claim any of it is visually verified.**
- **No backup restore drill.** Issue #21. The backup script and its LaunchAgent exist in `air/`
  but have not been installed or exercised. Nobody has restored a database and confirmed it
  works.
- **The map's group chooser has no real data behind it.** All 19 mappable properties have
  distinct coordinates. The chooser was verified by forcing three onto one point in a throwaway
  copy of the database. It is unit-tested, and it has never fired on real data.
- **`rateAction` still returns silently** on an empty submission. It is the one mutation without
  a result state; its form belongs to PIP-10.
- **Four of the 23 properties have no coordinates**, so they appear in the list and never on the
  map. The list now says how many, which is the fix — the behaviour itself is correct.
- **The Air is still running the 2026-09-07 build.** Everything merged on 09-08 — five packages —
  is on `main` and not on the preview. Redeploy with `./deploy.sh`.

---

## 9. Traps in this checkout

Two of these cost real time. Read them before you debug something that is not your bug.

- **A worktree needs its own `node_modules`.** Turbopack refuses a symlink that points outside
  the worktree (`Symlink [project]/node_modules is invalid`). Run `pnpm install` inside the
  worktree; it takes about three seconds and hard-links from the store.
- **iCloud can break the canonical checkout's `node_modules` symlink.** It happened on
  2026-09-08. What iCloud actually did: it kept the symlink but renamed it `node_modules 2`,
  and put an empty real directory in its place. So `node_modules.nosync/` was intact at 558 MB,
  the symlink still existed under another name, and every command failed with
  `no such file or directory: ./node_modules/.bin/vitest`.

  The fix, in this order:

  ```sh
  ps -o %cpu= -p $(pgrep -x bird)      # ~0.0 first, or iCloud rebuilds it under you
  rm -rf node_modules                  # ~4 minutes, for an empty directory
  rm "node_modules 2"                  # the renamed symlink
  ln -s node_modules.nosync node_modules
  ```

  While the `rm` runs, even `find` on that directory hangs. `.gitignore` now also matches
  `node_modules 2`, so a collision rename can never be committed by accident.
- **A worktree is not a faithful copy.** It sits on an ASCII path outside iCloud; the real
  checkout does not. PR #69 exists because of exactly that difference. Run the checks in the
  canonical checkout before you call a branch green.

---

## 10. How to pick up the next piece of work

1. Read `CLAUDE.md`, `DESIGN.md`, this file, and `WORKPLAN.md` § 4 (the agent contract).
2. Take the next eligible package from § 5 above. **PIP-05 is next.**
3. Open a GitHub issue for it. Do not invent issue numbers.
4. Branch `issue-<n>-<slug>` in a worktree outside iCloud, then `pnpm install` inside it.
5. Implement only that package. Add tests that fail if the behaviour breaks.
6. Run the checks **in the canonical checkout** before opening the pull request.
7. Record what you did not verify. Do not mark a visual check passed from reading source.
