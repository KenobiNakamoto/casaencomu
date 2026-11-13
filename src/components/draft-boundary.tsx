"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { syncDraftAccount } from "@/lib/draft-storage";

/** Also mounts at the login page, so server-side logout removes this tab's private text. */
export default function DraftBoundary({ accountId }: { accountId: string | null }) {
  const path = usePathname();
  useEffect(() => { syncDraftAccount(accountId); }, [accountId, path]);
  return null;
}
