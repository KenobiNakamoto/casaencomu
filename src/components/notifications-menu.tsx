"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { markSeenAction } from "@/app/actividad/actions";
import type { Item } from "@/lib/notifications";
import { ago } from "./propiedades/format";

const LINE: Record<Item["kind"], (t: string) => string> = {
  import: (t) => `Tu enlace se ha añadido: «${t}»`,
  completed: (t) => `Ya se ha leído tu enlace: «${t}»`,
};

const TABS = [
  ["notificaciones", "Notificaciones"],
  ["actividad", "Actividad"],
] as const;
type Tab = (typeof TABS)[number][0];

function Row({ item }: { item: Item }) {
  return (
    <li>
      <Link
        href={`/propiedades/${item.propertyId}`}
        className="flex min-h-11 items-start gap-3 rounded-lg px-3 py-3 transition hover:bg-surface-soft"
      >
        <span className="flex-1 text-[15px] leading-snug">{LINE[item.kind](item.title)}</span>
        <time dateTime={item.at} className="shrink-0 pt-0.5 text-sm text-muted">
          {ago(item.at)}
        </time>
      </Link>
    </li>
  );
}

/**
 * The bell. One button, one panel, two tabs: what reached you, and what the family has been doing.
 *
 * The activity list is rendered on the server and handed in whole, so this file holds no SQL and
 * the feed stays one component. Opening the panel marks the notifications as seen — see
 * `markSeenAction` for why nothing is revalidated.
 */
export default function NotificationsMenu({
  unseen,
  digest,
  days,
  items,
  activity,
}: {
  unseen: number;
  digest: number;
  days: number;
  items: Item[];
  activity: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("notificaciones");
  const [read, setRead] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // A menu that only closes with its own button is a trap on a phone, where there is no Escape.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !read) {
      setRead(true);
      void markSeenAction();
    }
  };

  const nuevas = items.filter((i) => !i.seen);
  const antiguas = items.filter((i) => i.seen);
  const badge = read ? 0 : unseen;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={badge ? `Notificaciones, ${badge} sin leer` : "Notificaciones"}
        title="Notificaciones"
        className="touch-target relative flex h-11 w-11 items-center justify-center rounded-full border border-control-border text-ink transition hover:shadow-tier"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 0112 0v5l2 3H4l2-3zM10 20a2 2 0 004 0" />
        </svg>
        {badge ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-action px-1 text-[11px] font-semibold leading-none text-on-action">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notificaciones y actividad"
          className="absolute right-0 top-[calc(100%+10px)] z-30 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-hairline bg-raised shadow-tier"
        >
          {/* the speech-bubble point, drawn as a corner of the panel itself so it takes its border */}
          <span
            aria-hidden
            className="absolute -top-[7px] right-4 h-3 w-3 rotate-45 border-l border-t border-hairline bg-raised"
          />
          <div role="tablist" aria-label="Qué mirar" className="flex gap-1 border-b border-hairline-soft p-1.5">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-medium transition ${
                  tab === id ? "bg-surface-strong text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-[min(30rem,70vh)] overflow-y-auto overscroll-contain p-1.5" onClick={() => setOpen(false)}>
            {tab === "notificaciones" ? (
              <div role="tabpanel">
                {digest ? (
                  <Link
                    href="/revisar"
                    className="mb-1 flex min-h-11 items-center gap-3 rounded-lg bg-accent-tint px-3 py-3 text-[15px] font-medium text-accent transition hover:opacity-90"
                  >
                    {digest} piso{digest === 1 ? "" : "s"} nuevo{digest === 1 ? "" : "s"} en los últimos {days} días
                  </Link>
                ) : null}

                {nuevas.length ? (
                  <>
                    <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">Nuevas</p>
                    <ul className="divide-y divide-hairline-soft">
                      {nuevas.map((i) => (
                        <Row key={i.id} item={i} />
                      ))}
                    </ul>
                  </>
                ) : null}

                {antiguas.length ? (
                  <>
                    <p className="mt-2 border-t border-hairline-soft px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                      Antiguas
                    </p>
                    <ul className="divide-y divide-hairline-soft">
                      {antiguas.map((i) => (
                        <Row key={i.id} item={i} />
                      ))}
                    </ul>
                  </>
                ) : null}

                {!digest && !items.length ? (
                  <p className="px-3 py-6 text-muted">Aquí verás cuándo se guardan y se leen tus enlaces.</p>
                ) : null}
              </div>
            ) : (
              <div role="tabpanel">
                {activity}
                <Link
                  href="/actividad"
                  className="mt-1 flex min-h-11 items-center justify-center rounded-lg text-sm font-medium text-ink underline underline-offset-4"
                >
                  Ver toda la actividad
                </Link>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
