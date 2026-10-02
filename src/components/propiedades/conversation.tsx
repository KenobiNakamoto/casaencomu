"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { conversationAction, type CommentState } from "@/app/propiedades/actions";
import { BODY_MAX, removed, type CommentRow, type Node } from "@/lib/comment-shape";

/** Who has published an opinion here, for the «sobre la opinión de…» chooser. */
export type Voice = { id: string; name: string };

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";
const when = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const box =
  "w-full rounded-lg border border-control-border bg-raised p-3 text-sm text-ink transition focus:border-ink";
// `touch-target` grows the tap area to 44 px without growing the words: these sit in a line of
// text, and a button-sized control would read as one.
const quiet = "touch-target text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline";

/**
 * A text box that keeps what is in it.
 *
 * Two different losses, two different guards. A refused save gives the words back from the server
 * (`state.text`), and an unsent box survives a reload through `sessionStorage` — which is this
 * browser's alone and never reaches the database, so a composer nobody sent is nobody's business
 * but the writer's (F24).
 */
function Keeping({
  name,
  storeAs,
  defaultValue,
  boxRef,
  ...rest
}: {
  name: string;
  storeAs: string | null;
  defaultValue: string;
  boxRef: React.RefObject<HTMLTextAreaElement | null>;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  useEffect(() => {
    if (!storeAs || !boxRef.current || boxRef.current.value) return;
    try {
      boxRef.current.value = sessionStorage.getItem(storeAs) ?? "";
    } catch {
      // A browser that refuses storage still has a working box.
    }
  }, [storeAs, boxRef]);

  return (
    <textarea
      ref={boxRef}
      name={name}
      defaultValue={defaultValue}
      maxLength={BODY_MAX}
      rows={3}
      onChange={(e) => {
        if (!storeAs) return;
        try {
          sessionStorage.setItem(storeAs, e.currentTarget.value);
        } catch {}
      }}
      className={box}
      {...rest}
    />
  );
}

/**
 * The composer. One of these for the thread as a whole, and one more under whichever comment is
 * being answered.
 *
 * `commentId` is written here, in the browser, and kept across a refused send: the same identifier
 * arriving twice is one comment, so a double click or a retry after a lost answer cannot leave two
 * (V14). A new one is drawn only after a comment is actually accepted.
 */
function Composer({
  propertyId,
  parentId,
  voices,
  about,
  autoFocus,
  onDone,
  label,
  placeholder,
}: {
  propertyId: string;
  parentId: string | null;
  voices: Voice[];
  /** Whose opinion this box was opened to answer, from «Responder» on their card. */
  about?: string | null;
  autoFocus?: boolean;
  onDone?: () => void;
  label: string;
  placeholder: string;
}) {
  const [state, action, pending] = useActionState<CommentState, FormData>(conversationAction, null);
  const idRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const storeAs = `casa:comentario:${propertyId}:${parentId ?? ""}`;
  const failed = state && !state.ok ? state : null;

  // Rendered empty on the server and filled here, so there is no identifier in the HTML for the
  // two sides to disagree about.
  const draw = () => {
    if (idRef.current) idRef.current.value = crypto.randomUUID();
  };
  useEffect(draw, []);

  useEffect(() => {
    if (!state?.ok) return;
    draw();
    if (boxRef.current) boxRef.current.value = "";
    try {
      sessionStorage.removeItem(storeAs);
    } catch {}
    onDone?.();
    // `onDone` is a fresh closure on every render of the parent; the state is what says something
    // was written.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="propertyId" value={propertyId} readOnly />
      <input type="hidden" name="verbo" value="crear" readOnly />
      <input type="hidden" name="parentId" value={parentId ?? ""} readOnly />
      <input ref={idRef} type="hidden" name="commentId" defaultValue="" />

      <label className="sr-only" htmlFor={`nuevo-${parentId ?? "raiz"}`}>
        {label}
      </label>
      <Keeping
        id={`nuevo-${parentId ?? "raiz"}`}
        name="body"
        storeAs={storeAs}
        defaultValue={failed?.text ?? ""}
        boxRef={boxRef}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-invalid={failed ? true : undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        {voices.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Sobre la opinión de
            {/* `key`: the person arrives in the URL, and React keeps a mounted <select> on its own
                value rather than re-reading a changed defaultValue. */}
            <select
              key={about ?? ""}
              name="sobre"
              defaultValue={about ?? ""}
              className="h-8 rounded-md border border-control-border bg-raised px-2 text-xs text-ink"
            >
              <option value="">nadie en concreto</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" disabled={pending} className="btn-primary ml-auto h-9 rounded-lg px-4 text-sm font-medium">
          {pending ? "Enviando…" : label}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className={quiet}>
            Cancelar
          </button>
        )}
      </div>
      {failed && (
        <p role="status" aria-live="polite" className="text-xs text-error">
          {failed.message}
        </p>
      )}
    </form>
  );
}

/**
 * The version the words on screen were drawn from, taken once when the control opened.
 *
 * Not `comment.version` read on every render. While an advertisement is still being read, this
 * page refreshes itself every five seconds (`PendingPoll`), and a refresh that arrived mid-edit
 * would re-point the form at whatever the row says now — so the check would agree with itself and
 * refuse nothing. Frozen here, a comment moved by another device is refused, with the words kept
 * (V14).
 */
const useDrawnFrom = (version: number) => useState(version)[0];

/** Correcting what you wrote. Opens over the words, so you can see what you are changing. */
function Editing({ propertyId, comment, onDone }: { propertyId: string; comment: CommentRow; onDone: () => void }) {
  const [state, action, pending] = useActionState<CommentState, FormData>(conversationAction, null);
  const drawnFrom = useDrawnFrom(comment.version);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const failed = state && !state.ok ? state : null;
  useEffect(() => {
    if (state?.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="mt-1 space-y-2">
      <input type="hidden" name="propertyId" value={propertyId} readOnly />
      <input type="hidden" name="verbo" value="editar" readOnly />
      <input type="hidden" name="commentId" value={comment.id} readOnly />
      <input type="hidden" name="version" value={drawnFrom} readOnly />
      <Keeping name="body" storeAs={null} defaultValue={failed?.text ?? comment.body} boxRef={boxRef} autoFocus aria-label="Editar el comentario" />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary h-8 rounded-lg px-3 text-xs font-medium">
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={onDone} className={quiet}>
          Cancelar
        </button>
      </div>
      {failed && <p className="text-xs text-error">{failed.message}</p>}
    </form>
  );
}

/** Taking it back, and the question asked in the page rather than in a browser box. */
function Removing({ propertyId, comment, onDone }: { propertyId: string; comment: CommentRow; onDone: () => void }) {
  const [state, action, pending] = useActionState<CommentState, FormData>(conversationAction, null);
  const drawnFrom = useDrawnFrom(comment.version);
  const failed = state && !state.ok ? state : null;
  useEffect(() => {
    if (state?.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="mt-1 flex flex-wrap items-center gap-3">
      <input type="hidden" name="propertyId" value={propertyId} readOnly />
      <input type="hidden" name="verbo" value="borrar" readOnly />
      <input type="hidden" name="commentId" value={comment.id} readOnly />
      <input type="hidden" name="version" value={drawnFrom} readOnly />
      <span className="text-xs text-muted">¿Quitar lo que escribiste?</span>
      <button type="submit" disabled={pending} className="touch-target text-xs font-medium text-error underline-offset-4 hover:underline">
        {pending ? "Quitando…" : "Sí, quitarlo"}
      </button>
      <button type="button" onClick={onDone} className={quiet}>
        No
      </button>
      {failed && <p className="w-full text-xs text-error">{failed.message}</p>}
    </form>
  );
}

/** One comment: who wrote it, when, what it answers, and the three things its author can do. */
function Bubble({
  propertyId,
  comment,
  viewerId,
  onReply,
  small,
}: {
  propertyId: string;
  comment: CommentRow;
  viewerId: string;
  onReply?: () => void;
  small?: boolean;
}) {
  const [doing, setDoing] = useState<"" | "editar" | "borrar">("");
  const mine = comment.user_id === viewerId;
  const gone = removed(comment);

  if (gone) {
    return (
      <p className="text-sm italic text-muted">Comentario retirado por quien lo escribió.</p>
    );
  }

  return (
    <div className="flex gap-3">
      <span
        className={`flex ${small ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm"} shrink-0 items-center justify-center rounded-full bg-surface-strong font-semibold text-ink`}
        aria-hidden
      >
        {initial(comment.name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px]">
          <span className="font-semibold text-ink">{comment.name}</span>
          <span className="text-muted"> · {when(comment.created_at)}</span>
          {comment.updated_at && <span className="text-muted"> · editado</span>}
        </div>
        {comment.opinion_name && (
          <p className="mt-0.5 text-xs text-muted">Sobre la opinión de {comment.opinion_name}</p>
        )}

        {doing === "editar" ? (
          <Editing propertyId={propertyId} comment={comment} onDone={() => setDoing("")} />
        ) : (
          <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-body">{comment.body}</p>
        )}

        {doing === "borrar" ? (
          <Removing propertyId={propertyId} comment={comment} onDone={() => setDoing("")} />
        ) : (
          doing === "" && (
            <div className="mt-1 flex flex-wrap gap-3">
              {onReply && (
                <button type="button" onClick={onReply} className={quiet}>
                  Responder
                </button>
              )}
              {/* Only the author sees these, and only the author's own id gets past the server:
                  what is hidden here is a courtesy, what is checked there is the rule (V23). */}
              {mine && (
                <>
                  <button type="button" onClick={() => setDoing("editar")} className={quiet}>
                    Editar
                  </button>
                  <button type="button" onClick={() => setDoing("borrar")} className={quiet}>
                    Eliminar
                  </button>
                </>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}

/**
 * The whole conversation, and the box to add to it.
 *
 * Oldest first, and the composer at the foot: a thread with answers under its comments cannot be
 * read newest-first without the answers arriving before what they answer.
 */
export function Conversation({
  propertyId,
  nodes,
  viewerId,
  voices,
  about,
}: {
  propertyId: string;
  nodes: Node[];
  viewerId: string;
  voices: Voice[];
  /**
   * Whose opinion the reader pressed «Responder» on. It arrives in the URL, so the link works
   * with no JavaScript of ours and the state survives a reload.
   */
  about?: string | null;
}) {
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const answering = voices.find((v) => v.id === about) ?? null;

  return (
    <div className="flex min-h-0 flex-col gap-4">
      {nodes.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay comentarios. Empieza tú.</p>
      ) : (
        <ul className="flex max-h-[460px] flex-col gap-5 overflow-y-auto pr-1">
          {nodes.map((n) => (
            <li key={n.id} className="space-y-3">
              <Bubble
                propertyId={propertyId}
                comment={n}
                viewerId={viewerId}
                // A comment somebody took back holds no answer of its own, so it offers none.
                onReply={removed(n) ? undefined : () => setReplyTo(replyTo === n.id ? null : n.id)}
              />
              {(n.replies.length > 0 || replyTo === n.id) && (
                <ul className="ml-5 space-y-4 border-l border-hairline-soft pl-4">
                  {n.replies.map((r) => (
                    <li key={r.id}>
                      {/* No `onReply`: one level is the whole shape. */}
                      <Bubble propertyId={propertyId} comment={r} viewerId={viewerId} small />
                    </li>
                  ))}
                  {replyTo === n.id && (
                    <li>
                      <Composer
                        propertyId={propertyId}
                        parentId={n.id}
                        voices={voices}
                        autoFocus
                        onDone={() => setReplyTo(null)}
                        label="Responder"
                        placeholder={`Respondiendo a ${n.name}…`}
                      />
                    </li>
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-hairline-soft pt-4">
        {/* The reader arrived here from somebody's opinion. Saying whose, above the box, is what
            tells them the link did something: the chooser below is one line of small print. */}
        {answering && (
          <p className="mb-2 text-xs text-muted">
            Respondiendo a la opinión de <span className="font-medium text-ink">{answering.name}</span>
          </p>
        )}
        <Composer
          propertyId={propertyId}
          parentId={null}
          voices={voices}
          about={about}
          autoFocus={Boolean(answering)}
          label="Comentar"
          placeholder={answering ? `Qué le dirías a ${answering.name}…` : "Qué te gusta, qué te preocupa y qué hay que comprobar."}
        />
      </div>
    </div>
  );
}
