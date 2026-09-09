import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Presence } from "./extract";
import { Listing } from "./listing";

/** The model, replaced by a queue of answers, so the layers can be driven without a key. */
const h = vi.hoisted(() => ({
  ready: true,
  answers: [] as (Record<string, unknown> | null)[],
  calls: [] as { name: string; prompt: string; images?: unknown[] }[],
}));
vi.mock("./ai", () => ({
  aiReady: () => h.ready,
  ask: async (opts: { name: string; prompt: string; images?: unknown[] }) => {
    h.calls.push(opts);
    return h.answers.shift() ?? null;
  },
}));

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "casa-enrich-"));
const { fill } = await import("./enrich");

const listing = (over: Partial<Listing> = {}) => Listing.parse({ title: "Piso en el Eixample", ...over });
const presenceOf = (present: string[]): Presence =>
  Object.fromEntries(
    Object.keys(Listing.shape)
      .filter((k) => k !== "photos")
      .map((k) => [k, present.includes(k) ? "present" : "absent"]),
  );

const RAW = {
  text:
    "Piso de 87 m² con 3 habitaciones y 2 baños en 3ª planta. Precio 575.000 €. Ascensor y terraza. " +
    "Gastos 70 €/mes. En buen estado. Sin plaza de garaje. Barrio: Eixample. Anuncia Savills.",
};

beforeEach(() => {
  h.ready = true;
  h.answers = [];
  h.calls = [];
});

describe("fill — layer 2 reads what layer 1 missed", () => {
  it("fills only the gaps and says which layer did it", async () => {
    h.answers = [{ price_eur: 575_000, rooms: 3, area_m2: 999 }];
    const r = await fill({
      listing: listing({ area_m2: 87 }),
      presence: presenceOf(["title", "area_m2"]),
      raw: RAW,
    });
    expect(r.listing.price_eur).toBe(575_000);
    expect(r.listing.rooms).toBe(3);
    // Already known from the page: the model was never asked, so it cannot overwrite it.
    expect(r.listing.area_m2).toBe(87);
    expect(h.calls[0].prompt).not.toContain("area_m2");
    expect(r.origin).toMatchObject({ title: "portal", area_m2: "portal", price_eur: "ai_read", rooms: "ai_read" });
    expect(r.read.sort()).toEqual(["price_eur", "rooms"]);
    expect(r.presence.price_eur).toBe("present");
  });

  it("rejects a value outside its range instead of storing it", async () => {
    h.answers = [{ price_eur: 5, area_m2: 87 }];
    const r = await fill({ listing: listing(), presence: presenceOf(["title"]), raw: RAW });
    expect(r.listing.price_eur ?? null).toBeNull();
    expect(r.listing.area_m2).toBe(87);
    expect(r.read).toEqual(["area_m2"]);
  });

  it("treats the model's words for nothing as nothing", async () => {
    h.answers = [{ floor: "  ", condition: "desconocido", agency: "  Savills " }];
    const r = await fill({ listing: listing(), presence: presenceOf(["title"]), raw: RAW });
    expect(r.listing.floor ?? null).toBeNull();
    expect(r.listing.condition ?? null).toBeNull();
    expect(r.listing.agency).toBe("Savills");
  });

  /**
   * The prompt tells the model that every value has to appear in the page. Asking is not
   * enforcing: measured against the family's own listings, 1 in 5 came back with an agency name
   * the model had joined together out of two places, one of them the privacy notice.
   */
  it("drops a value that is not in the page, however plausible it reads", async () => {
    h.answers = [{ agency: "Carles Juanico Riera - iad España", neighborhood: "Eixample" }];
    const r = await fill({ listing: listing(), presence: presenceOf(["title"]), raw: RAW });
    expect(r.listing.agency ?? null).toBeNull();
    expect(r.listing.neighborhood).toBe("Eixample");
    expect(r.read).toEqual(["neighborhood"]);
  });

  it("does not mind how the page spells it", async () => {
    // Same words, different accent and case. The page says «Eixample»; this is still a reading.
    h.answers = [{ neighborhood: "EIXAMPLE", floor: "3ª" }];
    const r = await fill({ listing: listing(), presence: presenceOf(["title"]), raw: RAW });
    expect(r.listing.neighborhood).toBe("EIXAMPLE");
    expect(r.listing.floor).toBe("3ª");
  });

  it("still lets it build the outdoor list, because that field is asked for as a list", async () => {
    h.answers = [{ outdoor: "terraza, balcón" }];
    const r = await fill({ listing: listing(), presence: presenceOf(["title"]), raw: RAW });
    expect(r.listing.outdoor).toBe("terraza, balcón");
  });

  it("asks nothing when there is no page text, and nothing when there is no key", async () => {
    await fill({ listing: listing(), presence: presenceOf(["title"]), raw: {} });
    expect(h.calls).toHaveLength(0);
    h.ready = false;
    await fill({ listing: listing(), presence: presenceOf(["title"]), raw: RAW });
    expect(h.calls).toHaveLength(0);
  });
});

describe("fill — layer 3 deduces, and only what may be deduced", () => {
  it("never offers the model a price, an address or a description to invent", async () => {
    h.answers = [null, { condition: "a reformar" }];
    const r = await fill({
      listing: listing({ description: "Piso a reformar, luminoso." }),
      presence: presenceOf(["title", "description"]),
      raw: RAW,
      photos: [{ media_type: "image/jpeg", data: "AA==" }],
    });
    const deduce = h.calls[1];
    expect(deduce.name).toBe("campos_deducidos");
    for (const forbidden of ["price_eur", "address_text", "description", "agency", "neighborhood", "energy_rating"]) {
      expect(deduce.prompt).not.toContain(`- ${forbidden}:`);
    }
    expect(deduce.images).toHaveLength(1);
    expect(r.listing.condition).toBe("a reformar");
    expect(r.origin.condition).toBe("ai_inferred");
    expect(r.inferred).toEqual(["condition"]);
  });

  it("is skipped when there is neither a description nor a photograph", async () => {
    h.answers = [null];
    await fill({ listing: listing(), presence: presenceOf(["title"]), raw: { text: RAW.text } });
    expect(h.calls.map((c) => c.name)).toEqual(["campos_del_anuncio"]);
  });

  it("does not deduce a field layer 2 already read off the page", async () => {
    h.answers = [{ rooms: 3, bathrooms: 2, area_m2: 87, floor: "3ª", outdoor: "terraza", condition: "buen estado", lift: true, parking: false }];
    const r = await fill({
      listing: listing({ description: "Piso reformado." }),
      presence: presenceOf(["title", "description"]),
      raw: RAW,
    });
    expect(h.calls).toHaveLength(1); // every inferable field was filled by the read, so nothing is left
    expect(r.inferred).toEqual([]);
    expect(r.origin.rooms).toBe("ai_read");
  });
});
