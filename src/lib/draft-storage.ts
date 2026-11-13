/** Browser-only unsent text. The server supplies the account and project; neither comes from a form. */
export type DraftOwner = { accountId: string; projectId: string };
const PREFIX = "casa:draft:v2:";
const legacy = (key: string) => key.startsWith("casa:opinion:") || key.startsWith("casa:comentario:");
export const draftKey = (owner: DraftOwner, kind: string, propertyId: string, reply = "") =>
  PREFIX + JSON.stringify([owner.accountId, owner.projectId, kind, propertyId, reply]);

/** Delete unsigned old records and all departing-account text. Preserve unrelated browser preferences. */
export function syncDraftAccount(accountId: string | null) {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      if (legacy(key)) sessionStorage.removeItem(key);
      else if (key.startsWith(PREFIX)) {
        let owner: unknown;
        try { owner = JSON.parse(sessionStorage.getItem(key) ?? "null")?.accountId; } catch {}
        if (!accountId || owner !== accountId) sessionStorage.removeItem(key);
      }
    }
  } catch { /* Storage can be disabled without disabling the editor. */ }
}

export function readDraft<T>(owner: DraftOwner, key: string): T | null {
  try {
    syncDraftAccount(owner.accountId);
    const held = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return held?.accountId === owner.accountId && held?.projectId === owner.projectId ? held.value as T : null;
  } catch { return null; }
}

export function writeDraft<T>(owner: DraftOwner, key: string, value: T) {
  try {
    syncDraftAccount(owner.accountId);
    sessionStorage.setItem(key, JSON.stringify({ ...owner, value }));
  } catch {}
}

export function clearDraft(key: string) {
  try { sessionStorage.removeItem(key); } catch {}
}
