import { describe, expect, it } from "vitest";
import { aspect, blockers, digest, overall, said, stanceLine, tally, voiceCount, type Voice } from "./compare";
import { DIMENSIONS } from "./listing";
import type { RatingRow } from "./ratings";

const ANA = "u-ana";
const LUIS = "u-luis";
const MAR = "u-mar";

const voice = (id: string, name: string, v: Partial<Voice> = {}): Voice => ({
  user_id: id,
  name,
  stance: "me_interesa",
  reasoning: "",
  blocker: false,
  ...v,
});

const score = (user_id: string, dimension: string, s: number): RatingRow => ({ user_id, dimension, score: s });

describe("tally", () => {
  it("counts in declaration order, not by how many", () => {
    const voices = [
      voice(ANA, "Ana", { stance: "no_me_encaja" }),
      voice(LUIS, "Luis", { stance: "dudas" }),
      voice(MAR, "Mar", { stance: "dudas" }),
    ];
    expect(tally(voices)).toBe("2 dudas · 1 no encaja");
  });

  it("does not count a published opinion with no stance as a stance", () => {
    expect(tally([voice(ANA, "Ana", { stance: null })])).toBeNull();
  });

  it("is null when nobody has published", () => {
    expect(tally([])).toBeNull();
  });
});

describe("stanceLine", () => {
  const voices = [voice(ANA, "Ana"), voice(LUIS, "Luis", { stance: "dudas" })];

  it("gives the family the tally", () => {
    expect(stanceLine(voices, null)).toBe("1 me interesa · 1 dudas");
  });

  it("gives one person their own word", () => {
    expect(stanceLine(voices, LUIS)).toBe("Dudas");
  });

  it("separates published-without-a-stance from never-published", () => {
    expect(stanceLine([voice(ANA, "Ana", { stance: null })], ANA)).toBe("Sin postura");
    expect(stanceLine(voices, MAR)).toBeNull();
  });
});

describe("blockers", () => {
  const voices = [voice(ANA, "Ana", { blocker: true }), voice(LUIS, "Luis"), voice(MAR, "Mar", { blocker: true })];

  it("names both sides rather than counting them", () => {
    expect(blockers(voices, null)).toEqual(["Ana", "Mar"]);
  });

  it("through one person's lens shows only their own", () => {
    expect(blockers(voices, LUIS)).toEqual([]);
    expect(blockers(voices, MAR)).toEqual(["Mar"]);
  });
});

describe("aspect and overall agree with each other", () => {
  // Ana scored all six; Luis scored one. Row-weighted, Luis barely counts.
  const scores: RatingRow[] = [...DIMENSIONS.map((d) => score(ANA, d, 5)), score(LUIS, "ubicacion", 1)];

  it("weighs each person once in the overall number", () => {
    // 5,0 and 1,0 by people; 4,43 by rows.
    expect(overall(scores, null)).toBe(3);
  });

  it("gives one aspect the mean of the people who scored that aspect", () => {
    expect(aspect(scores, "ubicacion", null)).toBe(3);
    expect(aspect(scores, "estado", null)).toBe(5);
  });

  it("through one person's lens is that person's own score", () => {
    expect(aspect(scores, "ubicacion", LUIS)).toBe(1);
    expect(overall(scores, LUIS)).toBe(1);
    expect(overall(scores, ANA)).toBe(5);
  });

  it("is null where nobody scored, rather than zero", () => {
    expect(aspect(scores, "estado", LUIS)).toBeNull();
    expect(overall([], null)).toBeNull();
    expect(overall(scores, MAR)).toBeNull();
  });
});

describe("said", () => {
  const voices = [
    voice(LUIS, "Luis", { reasoning: "Está lejos del metro" }),
    voice(ANA, "Ana", { reasoning: "Me gusta la luz" }),
    voice(MAR, "Mar", { reasoning: "   " }),
  ];

  it("puts the reader first and then sorts by name", () => {
    expect(said(voices, null, LUIS).map((v) => v.name)).toEqual(["Luis", "Ana"]);
    expect(said(voices, null, ANA).map((v) => v.name)).toEqual(["Ana", "Luis"]);
  });

  it("drops people who published without writing anything", () => {
    expect(said(voices, null, ANA).some((v) => v.user_id === MAR)).toBe(false);
  });

  it("through one person's lens is only theirs", () => {
    expect(said(voices, LUIS, ANA).map((v) => v.name)).toEqual(["Luis"]);
  });
});

describe("digest", () => {
  it("is null where nobody has spoken, so two silent columns do not differ", () => {
    expect(digest([])).toBeNull();
    expect(digest([])).toBe(digest([]));
  });

  it("ignores the order the rows arrived in", () => {
    const a = [voice(ANA, "Ana", { reasoning: "sí" }), voice(LUIS, "Luis")];
    expect(digest(a)).toBe(digest([...a].reverse()));
  });

  it("changes when a stance, a blocker or a word changes", () => {
    const base = [voice(ANA, "Ana", { reasoning: "sí" })];
    expect(digest(base)).not.toBe(digest([voice(ANA, "Ana", { reasoning: "sí", stance: "dudas" })]));
    expect(digest(base)).not.toBe(digest([voice(ANA, "Ana", { reasoning: "sí", blocker: true })]));
    expect(digest(base)).not.toBe(digest([voice(ANA, "Ana", { reasoning: "no" })]));
  });

  it("does not mutate what it is given", () => {
    const voices = [voice(LUIS, "Luis"), voice(ANA, "Ana")];
    digest(voices);
    expect(voices.map((v) => v.user_id)).toEqual([LUIS, ANA]);
  });
});

describe("voiceCount", () => {
  it("never implies the family is complete", () => {
    expect(voiceCount([voice(ANA, "Ana")], 4)).toBe("1 de 4 personas");
    expect(voiceCount([], 4)).toBe("Nadie ha opinado todavía");
  });
});
