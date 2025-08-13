"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";
// No cookies: rely on localStorage with 24h TTL to avoid issues when cookies are blocked

export function BetaBanner() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const until = window.localStorage.getItem("cm_beta_banner_dismissed_until");
        if (until) {
          const expiresAt = Number(until);
          if (!Number.isNaN(expiresAt) && Date.now() < expiresAt) {
            setHidden(true);
            return;
          }
          // Expired: clean it up
          window.localStorage.removeItem("cm_beta_banner_dismissed_until");
        }
      }
      setHidden(false);
    } catch {
      setHidden(false);
    }
  }, []);

  const dismiss = () => {
    try {
      if (typeof window !== "undefined") {
        const twentyFourHours = 24 * 60 * 60 * 1000;
        const expiresAt = Date.now() + twentyFourHours;
        window.localStorage.setItem("cm_beta_banner_dismissed_until", String(expiresAt));
      }
    } catch {}
    setHidden(true);
  };

  if (hidden) return null;

  return (
    <div className={cn("w-full bg-amber-50 text-amber-900 border-b border-amber-200")}> 
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2 text-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-amber-900 text-xs font-bold">β</span>
          <span>
            You’re using the Beta version of Coinmind. We’d love your feedback.
            {" "}
            <Link href="https://forms.gle/jd9KjRQDN6zBKncm9" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:no-underline">Share feedback</Link>
          </span>
        </div>
        <button onClick={dismiss} aria-label="Dismiss beta banner" className="text-amber-900/70 hover:text-amber-900">Dismiss</button>
      </div>
    </div>
  );
}


