"use server";

import type { InStatement } from "@libsql/client";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DIMENSIONS, STAGE_LABELS, STAGES, type Dimension, type EventKind, type Stage } from "@/lib/listing";
import { UPSERT_RATING_SQL } from "@/lib/ratings";
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

/** Upserts every dimension present in the form (1–5) and writes one `rating` event. */
export async function rateAction(propertyId: string, formData: FormData) {
  const user = await currentUser();
  const scores: Partial<Record<Dimension, number>> = {};
  for (const dim of DIMENSIONS) {
    const n = Number(formData.get(dim));
    if (Number.isInteger(n) && n >= 1 && n <= 5) scores[dim] = n;
  }
  const entries = Object.entries(scores);
  if (entries.length === 0) return;
  const now = new Date().toISOString();
  await db.batch(
    [
      ...entries.map(([dim, score]): InStatement => ({ sql: UPSERT_RATING_SQL, args: [propertyId, user.id, dim, score, now] })),
      event(propertyId, "rating", { scores }, user.id, now),
    ],
    "write",
  );
  revalidatePath(detail(propertyId));
  revalidatePath(LIST);
}

/**
 * What a form has to show afterwards. `text` is echoed back so a rejected save leaves the words
 * in the box: losing what somebody typed is the one failure they cannot undo (F25).
 */
export type SaveState = { ok: true } | { ok: false; message: string; text?: string } | null;

export async function commentAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const propertyId = String(formData.get("propertyId") ?? "");
  const user = await currentUser();
  const raw = String(formData.get("body") ?? "");
  const body = raw.trim().slice(0, 4000);
  if (!body) return { ok: false, message: "Escribe algo antes de comentar.", text: raw };
  const now = new Date().toISOString();
  const id = randomUUID();
  await db.batch(
    [
      {
        sql: "INSERT INTO comments (id, property_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
        args: [id, propertyId, user.id, body, now],
      },
      event(propertyId, "comment", { comment_id: id, body }, user.id, now),
    ],
    "write",
  );
  revalidatePath(detail(propertyId));
  return { ok: true };
}

/**
 * Anyone can change a stage, but only from the stage they were looking at. The form carries the
 * `stage_version` it was drawn with, and the update is conditional on it, so two people deciding
 * at once cannot silently overwrite each other — the second one is told (F25).
 */
export async function setStageAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const propertyId = String(formData.get("propertyId") ?? "");
  const user = await currentUser();
  const to = String(formData.get("etapa") ?? "");
  const seen = Number(formData.get("version"));
  if (!STAGES.includes(to as Stage)) return { ok: false, message: "Esa etapa no existe." };
  if (!Number.isInteger(seen)) return { ok: false, message: "Vuelve a cargar la página e inténtalo otra vez." };

  const { rows } = await db.execute({
    sql: "SELECT stage, stage_version FROM properties WHERE id = ?",
    args: [propertyId],
  });
  const from = rows[0]?.stage;
  if (typeof from !== "string") return { ok: false, message: "Esta propiedad ya no existe." };
  if (Number(rows[0].stage_version) !== seen) {
    return {
      ok: false,
      message: `Otra persona la ha movido a ${STAGE_LABELS[from as Stage] ?? from} mientras decidías. Míralo y vuelve a elegir.`,
    };
  }
  if (from === to) return { ok: true };

  const now = new Date().toISOString();
  await db.batch(
    [
      {
        // stage_version advances here and nowhere else: a source refresh must not look like a
        // decision (doc 05 § 3). The `WHERE` on it is what makes the check above a real one and
        // not a guess that another write can slip past.
        sql: "UPDATE properties SET stage = ?, stage_version = stage_version + 1, updated_at = ? WHERE id = ? AND stage_version = ?",
        args: [to, now, propertyId, seen],
      },
      event(propertyId, "stage_change", { from, to }, user.id, now),
    ],
    "write",
  );
  revalidatePath(detail(propertyId));
  revalidatePath(LIST);
  return { ok: true };
}
