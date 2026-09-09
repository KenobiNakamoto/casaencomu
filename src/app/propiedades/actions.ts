"use server";

import type { InStatement } from "@libsql/client";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DIMENSIONS, STAGE_LABELS, STAGES, type Dimension, type EventKind, type Stage } from "@/lib/listing";
import { changedScores, UPSERT_RATING_SQL } from "@/lib/ratings";
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
 * What the form has to show afterwards. A refused save gives back the words **and** the scores:
 * losing what somebody typed is the one failure they cannot undo (F25), and the scores are typed
 * as much as the sentence is.
 */
export type OpinionState =
  | { ok: true; saved: string }
  | { ok: false; message: string; text: string; scores: Partial<Record<Dimension, number>> }
  | null;

/**
 * One opinion, one write. The scores, the comment and the stage arrive from one box with one
 * button, and they reach the database in one transaction — so half an opinion is not a state the
 * family can end up in.
 *
 * Each part is written only if it actually changed: an unchanged score writes no row and no
 * event, an empty box writes no comment, and the stage the home is already in writes nothing.
 * Otherwise the activity feed would fill with «Valoración guardada» every time somebody typed a
 * sentence, because the six radios are always submitted.
 */
export async function opinionAction(_prev: OpinionState, formData: FormData): Promise<OpinionState> {
  const propertyId = String(formData.get("propertyId") ?? "");
  const user = await currentUser();

  const scores: Partial<Record<Dimension, number>> = {};
  for (const dim of DIMENSIONS) {
    const n = Number(formData.get(dim));
    if (Number.isInteger(n) && n >= 1 && n <= 5) scores[dim] = n;
  }
  const raw = String(formData.get("body") ?? "");
  const body = raw.trim().slice(0, 4000);
  const to = String(formData.get("etapa") ?? "");
  const seen = Number(formData.get("version"));
  const back = { text: raw, scores };

  if (!STAGES.includes(to as Stage)) return { ok: false, message: "Esa etapa no existe.", ...back };
  if (!Number.isInteger(seen)) return { ok: false, message: "Vuelve a cargar la página e inténtalo otra vez.", ...back };

  const [prop, mine] = await db.batch(
    [
      { sql: "SELECT stage, stage_version FROM properties WHERE id = ?", args: [propertyId] },
      { sql: "SELECT dimension, score FROM ratings WHERE property_id = ? AND user_id = ?", args: [propertyId, user.id] },
    ],
    "read",
  );
  const from = prop.rows[0]?.stage;
  if (typeof from !== "string") return { ok: false, message: "Esta propiedad ya no existe.", ...back };
  if (Number(prop.rows[0].stage_version) !== seen) {
    return {
      ok: false,
      message: `Otra persona la ha movido a ${STAGE_LABELS[from as Stage] ?? from} mientras escribías. Míralo y vuelve a guardar.`,
      ...back,
    };
  }

  const current = Object.fromEntries(mine.rows.map((r) => [String(r.dimension), Number(r.score)]));
  const changed = changedScores(current, scores);
  const now = new Date().toISOString();
  const writes: InStatement[] = [];
  const done: string[] = [];

  if (changed.length > 0) {
    writes.push(
      ...changed.map(([dim, s]): InStatement => ({ sql: UPSERT_RATING_SQL, args: [propertyId, user.id, dim, s, now] })),
      event(propertyId, "rating", { scores: Object.fromEntries(changed) }, user.id, now),
    );
    done.push(changed.length === 1 ? "un aspecto" : `${changed.length} aspectos`);
  }
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
