# Fixtures

Real pages from the listing sites, saved so that `extract.test.ts` can run without a network and
without asking a portal for anything. They are the reason a change to the extractor cannot
silently break a portal nobody is looking at that week.

| File | What it is |
|---|---|
| `idealista.html` `fotocasa.html` `habitaclia.html` | one live advertisement each, 2026-09-04 |
| `idealista-removed.html` `fotocasa-removed.html` `habitaclia-removed.html` | what each portal answers for a listing that is gone |
| `vivalta.html` | a live Vivalta advertisement, 2026-09-07 |
| `vivalta-removed.html` | Vivalta's soft 404: HTTP 200 carrying the agency's own home page |
| `iad.html` | an iad España advertisement — head, the text around the price, and the schema.org script, stitched together |
| `housfy-capture.json` | Housfy in the bookmarklet shape, because its server answer is an empty shell |

## Rules for adding one

1. **Trim it, then read what you kept.** These files are committed. Agency names, telephone
   numbers, the client IP address and any API key are removed; the rest stays verbatim so the
   test is testing the real thing.
2. **Keep the parts the extractor reads**, and enough text around them to catch a false match:
   JSON-LD, the `og:*` block, the portal's own script, the `<img>` tags, and the window of text
   holding price, surface and rooms.
3. **A trimmed page must fail the way the real one does.** Cut too much and a test starts passing
   for the wrong reason. Two fixtures here were trimmed twice for exactly that: the first cut lost
   the schema.org script, the second cut lost "1 baño" out of the price window.
4. **Add the withdrawn version too**, if the portal has an interesting one. Vivalta's is the whole
   reason the extractor checks that the listing reference still appears in the page.

Untrimmed pages are never committed. They live in `_local/spike/`; three tests use them when they
are present and skip when they are not.
