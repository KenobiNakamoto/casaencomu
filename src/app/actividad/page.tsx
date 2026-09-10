import Link from "next/link";
import ActivityFeed from "@/components/activity-feed";
import { feed } from "@/lib/activity";
import { currentUser } from "@/lib/auth";
import { markReadAction } from "./actions";
import { Refresh } from "./refresh";

export const dynamic = "force-dynamic";

const btnQuiet =
  "touch-target h-9 shrink-0 rounded-lg border border-control-border px-3 text-sm font-medium text-body transition hover:text-ink";

/**
 * The whole feed, fifty at a time. «Ver todo» from the bell menu lands here, and so does a
 * notification link when there is more than a menu can hold.
 *
 * **Rendering this page marks nothing read.** It used to call `markSeen()` while the server
 * rendered, and Next prefetches a link on hover and in the viewport — so the badge went out for a
 * page nobody had opened (F27). Reading is now a button, and it sends the ids that were drawn.
 */
export default async function ActividadPage({ searchParams }: { searchParams: Promise<{ antes?: string }> }) {
  const { antes } = await searchParams;
  const user = await currentUser();
  const { rows, older, read, unread } = await feed(user.id, antes);
  // The ids on this page that this person has not read. The button sends exactly these.
  const pending = rows.filter((r) => !read.has(r.id) && r.actor_id !== user.id).map((r) => r.id);

  return (
    <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-[22px] font-medium">Actividad</h1>
        <Refresh />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-b border-hairline-soft pb-4">
        <p className="flex-1 text-sm text-muted">
          {unread === 0
            ? "Estás al día."
            : `${unread} sin ver${pending.length < unread ? `, ${pending.length} en esta página` : ""}.`}
        </p>
        {pending.length ? (
          <form action={markReadAction}>
            {pending.map((id) => (
              <input key={id} type="hidden" name="visto" value={id} readOnly />
            ))}
            <button type="submit" className={btnQuiet}>
              Marcar {pending.length === unread ? "todo" : "esta página"} como visto
            </button>
          </form>
        ) : null}
      </div>

      <div className="-mx-3 mt-2">
        <ActivityFeed rows={rows} read={read} userId={user.id} />
      </div>

      <div className="mt-6 flex items-center justify-center gap-3">
        {antes ? (
          <Link href="/actividad" className={btnQuiet}>
            Volver arriba
          </Link>
        ) : null}
        {older ? (
          <Link href={`/actividad?antes=${encodeURIComponent(older)}`} className={btnQuiet}>
            Más antiguas
          </Link>
        ) : (
          <p className="py-2 text-sm text-muted">No hay nada más atrás.</p>
        )}
      </div>
    </section>
  );
}
