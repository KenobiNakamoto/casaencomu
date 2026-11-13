import { expect, it } from "vitest";
import { Listing } from "./listing";
import { merge, originOf } from "./observation";
import { canonicalFacts } from "./changes";
it("keeps previous fields even when the new snapshot and presence map omit their keys entirely", () => {
  const before = canonicalFacts(Listing.parse({ title: "Home", rooms: 3, price_eur: 350000 }));
  const partial = Listing.parse({ title: "Home" });
  expect(merge(before, partial, { title: "present" })).toMatchObject({ rooms: 3, price_eur: 350000 });
});
it("lets explicit evidence clear a value and replaces its old inferred provenance", () => {
  const before = canonicalFacts(Listing.parse({ title: "Home", rooms: 3 }));
  expect(merge(before, Listing.parse({ title: "Home", rooms: null }), { rooms: "explicit_null" }).rooms).toBeNull();
  expect(originOf({ rooms: "ai_inferred" }, { rooms: "explicit_null" })).toEqual({ rooms: "portal" });
});
