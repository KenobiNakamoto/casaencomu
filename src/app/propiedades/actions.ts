"use server";

import type { InStatement } from "@libsql/client";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { STAGE_LABELS, STAGES, type EventKind, type Stage } from "@/lib/listing";
import { publish, saveDraft, withdraw, type OpinionInput, type Result } from "@/lib/opinions";
import { setBudget } from "@/lib/settings";

const LIST = "/propiedades";
const detail = (id: string) => `${LIST}/${id}`;

const event = (propertyId: string, kind: EventKind, payload: unknown, actorId: string, at: string): InStatement => ({
  sql: "INSERT INTO events (id, property_id, kind, payload_json, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  args: [randomUUID(), propertyId, kind, JSON.stringify(payload), actorId, at],
});

const nonNegInt = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return typeof v === "string" && v !== "" && Number.isInteger(n) && n >= 0 ? n : null;
};

/** «los aspectos, tu comentario y la etapa» — the receipt names what was actually written. */
const listOf = (parts: string[]) =>
  parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;

export async function setBudgetAction(formData: FormData) {
  await currentUser();
  const a = nonNegInt(formData.get("min"));
  const b = nonNegInt(formData.get("max"));
  // Either bound alone is a budget, and two empty fields clear it (F30).
  // ponytail: a reversed pair is a typo, not an error — swap it
  const [min, max] = a !== null && b !== null ? [Math.min(a, b), Math.max(a, b)] : [a, b];
  await setBudget(min, max);
  revalidatePath(LIST);
}

/**
 * What the box has to show afterwards. A refused save gives the words back: losing what somebody
 * typed is the one failure they cannot undo (F25).
 */
export type OpinionState =
  | { ok: true; saved: string }
  | { ok: false; message: string; text: string }
  | null;

/**
 * The comment and the stage, in one write. The scores used to travel with them and no longer do:
 * a score is part of an opinion, and an opinion is published through `publishOpinionAction` so it
 * can be versioned, drafted and withdrawn (#141). A comment is the family's conversation and the
 * stage is the family's decision — neither is one person's opinion, so both stay here.
 *
 * Each part is written only if it changed: an empty box writes no comment, and the stage the home
 * is already in writes nothing.
 */
export async function opinionAction(_prev: OpinionState, formData: FormData): Promise<OpinionState> {
  const propertyId = String(formData.get("propertyId") ?? "");
  const user = await currentUser();

  const raw = String(formData.get("body") ?? "");
  const body = raw.trim().slice(0, 4000);
  const to = String(formData.get("etapa") ?? "");
  const seen = Number(formData.get("version"));
  const back = { text: raw };

  if (!STAGES.includes(to as Stage)) return { ok: false, message: "Esa etapa no existe.", ...back };
  if (!Number.isInteger(seen)) return { ok: false, message: "Vuelve a cargar la página e inténtalo otra vez.", ...back };

  const prop = await db.execute({ sql: "SELECT stage, stage_version FROM properties WHERE id = ?", args: [propertyId] });
  const from = prop.rows[0]?.stage;
  if (typeof from !== "string") return { ok: false, message: "Esta propiedad ya no existe.", ...back };
  if (Number(prop.rows[0].stage_version) !== seen) {
    return {
      ok: false,
      message: `Otra persona la ha movido a ${STAGE_LABELS[from as Stage] ?? from} mientras escribías. Míralo y vuelve a guardar.`,
      ...back,
    };
  }

  const now = new Date().toISOString();
  const writes: InStatement[] = [];
  const done: string[] = [];

  if (body) {
    const id = randomUUID();
    writes.push(
      { sql: "INSERT INTO comments (id, property_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)", args: [id, propertyId, user.id, body, now] },
      event(propertyId, "comment", { comment_id: id, body }, user.id, now),
    );
    done.push("tu comentario");
  }
  if (from !== to) {
    writes.push(
      {
        // stage_version advances here and nowhere else: a source refresh must not look like a
        // decision (doc 05 § 3). The `WHERE` on it is what makes the check above a real one and
        // not a guess that another write can slip past.
        sql: "UPDATE properties SET stage = ?, stage_version = stage_version + 1, updated_at = ? WHERE id = ? AND stage_version = ?",
        args: [to, now, propertyId, seen],
      },
      event(propertyId, "stage_change", { from, to }, user.id, now),
    );
    done.push("la etapa");
  }
  if (writes.length === 0) return { ok: false, message: "No has cambiado nada todavía.", ...back };

  await db.batch(writes, "write");
  revalidatePath(detail(propertyId));
  revalidatePath(LIST);
  return { ok: true, saved: listOf(done) };
}

/* -------------------------------------------------------------------------------------------
 * The opinion itself (#141). Three actions, one rule: the author is `currentUser()` and never a
 * field in the request. An id that arrives with the form is a claim, not an identity, and a draft
 * is the one thing in this application that nobody else may read.
 *
 * Each one carries the version and revision the person's page was drawn from, so a second device
 * cannot be overwritten silently. `lib/opinions.ts` decides; this only names the caller and tells
 * Next.js what to redraw.
 * ----------------------------------------------------------------------------------------- */

type Expected = { version: number; revision: number };

const redraw = (propertyId: string) => {
  revalidatePath(detail(propertyId));
  revalidatePath(LIST);
};

export async function publishOpinionAction(propertyId: string, input: OpinionInput, expected: Expected): Promise<Result> {
  const user = await currentUser();
  const result = await publish(propertyId, user.id, input, expected);
  if (result.ok) redraw(propertyId);
  return result;
}

export async function saveDraftAction(propertyId: string, input: OpinionInput, expected: Expected): Promise<Result> {
  const user = await currentUser();
  // No path is revalidated: a draft changes nothing anybody else can see.
  return saveDraft(propertyId, user.id, input, { revision: expected.revision });
}

export async function withdrawOpinionAction(propertyId: string, expected: Expected): Promise<Result> {
  const user = await currentUser();
  const result = await withdraw(propertyId, user.id, expected);
  if (result.ok) redraw(propertyId);
  return result;
}
