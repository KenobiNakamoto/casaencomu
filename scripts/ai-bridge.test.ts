import { describe, expect, it } from "vitest";
import { parseJson, promptFor } from "./ai-bridge.mjs";

const body = (content: unknown, schema: unknown = { type: "object" }) => ({
  messages: [{ role: "user", content }],
  tools: [{ name: "campos", input_schema: schema }],
});

describe("promptFor", () => {
  it("carries the text and the shape the caller wants back", () => {
    const p = promptFor(body([{ type: "text", text: "Campos que faltan:\n- rooms" }], { properties: { rooms: {} } }));
    expect(p).toContain("Campos que faltan:");
    expect(p).toContain('"rooms"');
    expect(p).toContain("un único objeto JSON");
  });

  it("names the photographs, so the model opens the files rather than guessing", () => {
    const p = promptFor(body([{ type: "image" }, { type: "text", text: "dos fotos" }]), ["foto-1.jpg", "foto-2.jpg"]);
    expect(p).toContain("- foto-1.jpg");
    expect(p).toContain("- foto-2.jpg");
    expect(p).toContain("dos fotos");
  });
});

describe("parseJson", () => {
  it("reads a bare object", () => {
    expect(parseJson('{"rooms":3}')).toEqual({ rooms: 3 });
  });

  it("reads one inside a fence, and one with a sentence around it", () => {
    expect(parseJson('```json\n{"rooms":3}\n```')).toEqual({ rooms: 3 });
    expect(parseJson('Claro:\n{"rooms":3}\nEspero que ayude.')).toEqual({ rooms: 3 });
  });

  it("answers null rather than half an object", () => {
    for (const bad of ["", "no lo sé", '{"rooms":', "[1,2]", null, undefined]) expect(parseJson(bad)).toBeNull();
  });
});
