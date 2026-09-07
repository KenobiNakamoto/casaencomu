"use server";

import type { InStatement } from "@libsql/client";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DIMENSIONS, STAGES, type Dimension, type EventKind, type Stage } from "@/lib/listing";
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

export async function commentAction(propertyId: string, formData: FormData) {
  const user = await currentUser();
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!body) return;
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
}

/** Anyone can change a stage. No-op when the stage is unknown or unchanged. */
export async function setStageAction(propertyId: string, formData: FormData) {
  const user = await currentUser();
  const to = String(formData.get("etapa") ?? "");
  if (!STAGES.includes(to as Stage)) return;
  const { rows } = await db.execute({ sql: "SELECT stage FROM properties WHERE id = ?", args: [propertyId] });
  const from = rows[0]?.stage;
  if (typeof from !== "string" || from === to) return;
  const now = new Date().toISOString();
  await db.batch(
    [
      {
        // stage_version advances here and nowhere else: a source refresh must not look like a
        // decision (doc 05 § 3). PIP-08 uses it to reject a stale form.
        sql: "UPDATE properties SET stage = ?, stage_version = stage_version + 1, updated_at = ? WHERE id = ?",
        args: [to, now, propertyId],
      },
      event(propertyId, "stage_change", { from, to }, user.id, now),
    ],
    "write",
  );
  revalidatePath(detail(propertyId));
  revalidatePath(LIST);
}
