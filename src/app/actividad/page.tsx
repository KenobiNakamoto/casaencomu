import ActivityFeed from "@/components/activity-feed";
import { currentUser } from "@/lib/auth";
import { markSeen } from "@/lib/notifications";

/**
 * The whole feed. The bell menu shows the newest of it; this is «Ver todo», and the place a
 * notification link lands when there is more than a menu can hold.
 */
export default async function ActividadPage() {
  const user = await currentUser();
  const since = user.last_seen_at;
  const feed = <ActivityFeed userId={user.id} since={since} />;
  // Reading it is seeing it. Rendered first, so the «nuevo» marks survive this visit.
  await markSeen(user.id);

  return (
    <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-[22px] font-medium">Actividad</h1>
      <div className="mt-4 -mx-3">{feed}</div>
    </section>
  );
}
