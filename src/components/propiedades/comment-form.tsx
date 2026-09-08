"use client";

import { useActionState } from "react";
import { commentAction, type SaveState } from "@/app/propiedades/actions";

/**
 * A comment the family will read. When the save is refused the words come back in the box: the
 * one failure nobody can undo is losing what they had just written (F25).
 */
export function CommentForm({ propertyId }: { propertyId: string }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(commentAction, null);
  const failed = state && !state.ok ? state : null;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="propertyId" value={propertyId} readOnly />
      <textarea
        name="body"
        // `key` re-mounts the field so a cleared box after a success, and the returned text after
        // a failure, both take effect. `defaultValue` alone would keep whatever React first drew.
        key={failed ? "failed" : "fresh"}
        defaultValue={failed?.text ?? ""}
        rows={3}
        maxLength={4000}
        placeholder="Escribe un comentario…"
        aria-describedby="comment-status"
        aria-invalid={failed ? true : undefined}
        className="w-full rounded-lg border border-control-border bg-raised p-3 transition focus:border-ink"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-12 rounded-lg bg-ink px-6 text-base font-medium text-canvas transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Comentar"}
        </button>
        <p id="comment-status" role="status" className="text-sm">
          {failed && <span className="text-error">{failed.message}</span>}
        </p>
      </div>
    </form>
  );
}
