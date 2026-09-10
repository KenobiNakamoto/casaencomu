"use server";

import { currentUser } from "@/lib/auth";
import { markSeen } from "@/lib/notifications";

/**
 * The bell menu was opened. It deliberately revalidates nothing: the split between «Nuevas» and
 * «Antiguas» is on screen while the person is reading it, and moving everything to «Antiguas»
 * under their eyes would take away the only thing that told them what was new.
 */
export async function markSeenAction() {
  const user = await currentUser();
  await markSeen(user.id);
}
