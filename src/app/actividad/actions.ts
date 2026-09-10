"use server";

import { revalidatePath } from "next/cache";
import { markRead } from "@/lib/activity";
import { currentUser } from "@/lib/auth";
import { markSeen } from "@/lib/notifications";

/**
 * The bell menu was opened. It deliberately revalidates nothing: the split between «Nuevas» and
 * «Antiguas» is on screen while the person is reading it, and moving everything to «Antiguas»
 * under their eyes would take away the only thing that told them what was new.
 *
 * This is the bell's own state — `users.last_seen_at` — and nothing else reads it any more. The
 * activity feed used to share the column, so opening the menu cleared the marks on a page that
 * had never been opened (PIP-13).
 */
export async function markSeenAction() {
  const user = await currentUser();
  await markSeen(user.id);
}

/**
 * «Marcar como visto», on the activity page. The form carries the ids that were drawn, so what is
 * marked is what was on screen — not everything, and not everything older than this moment.
 *
 * A person who never reaches page two never marks page two. That is the whole reason for the
 * table behind it.
 */
export async function markReadAction(formData: FormData) {
  const user = await currentUser();
  await markRead(
    user.id,
    formData.getAll("visto").map(String),
  );
  revalidatePath("/actividad");
}
