# Prior art — does CasaEnComú already exist? (2026-09-04)

Searched GitHub (`gh search repos`), the web, and the Spanish portals' own features. Verdict:
**no existing tool covers the v1 set** — three Spanish portals + family ratings on dimensions +
compare + private self-hosting + iPhone Safari capture. Closest options below, best first.

| Option | Covers | Misses vs v1 | Cost |
|---|---|---|---|
| **Idealista + Fotocasa "listas colaborativas"** (native app feature; Idealista since 2024-04, Fotocasa too) | save, share with family, notes, new-ad notifications | one portal per list; no Habitaclia; no ratings by dimension; no compare grid; no cross-portal dedupe; their servers | free |
| **Flatlist** (flatlist.app, Chrome extension; Idealista, Fotocasa, Pisos.com, Habitaclia) | one-click save, map, AI score, collaborators | Chrome only (no iPhone Safari); no rating dimensions; no availability monitoring documented; their cloud | €5.99/mo Premium |
| **Notion "Tablero de búsqueda de casa" + Web Clipper** | shared board, manual ratings, stages | everything automatic: extraction, dedupe, photos, map, rechecks | free |
| **dzpincus/apartment-quest** (MIT, Next 16 + Supabase + Claude Haiku) | closest open-source shape: private group tracker, votes, chat, URL import with paste fallback, twice-daily rechecks, commute maps | NYC-specific, Supabase/Vercel (not the Air), shared password, LLM in the import path, no rating dimensions, no Spanish extractor | fork cost > v3 build |
| **timothygithinji/gaff** (MIT, archived) | swipe keep/skip for two, shortlist, compare, dedupe | UK rentals only, Cloudflare Workers + Neon, scrapers are UK-portal-specific | fork cost > v3 build |
| **adomi-io/listing-lab** (Apache, 129★) | share shortlist, price-cut tracking | US Realtor.com only, Odoo + RabbitMQ (too heavy for the Air) | — |
| HomesToCompare, Roost, Property Saver, Wahi | compare / shared shortlist | UK, London-rentals, UK-iOS, Toronto | SaaS |
| **abracadabra50/open-properties** (MIT CLI/MCP) | Idealista via official API, dedupe, snapshots | official API needs approved credentials; no UI | — |
| Spanish scrapers (`tetreum/xupopter` 2017, many `idealista-scraper`s) | reference for selectors during the spike | abandoned or anti-bot bypass (which we never do) | — |

**Borrow, don't fork:** apartment-quest's import chain (fetch → paste box fallback) and its
recheck status split; Gaff's keep/skip swipe as a later add-on.

**Rung-1 check before Phase 1:** run one Idealista collaborative list with the family for a
week. If nobody uses it, the app is not needed either. If they want ratings, compare, or
Habitaclia, build v3.
