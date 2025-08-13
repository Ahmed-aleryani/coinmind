"use client";

import { useEffect, useRef } from "react";
import Hotjar from "@hotjar/browser";

/**
 * Initializes Hotjar on the client.
 * Uses env vars when available, falls back to provided defaults.
 */
export function HotjarProvider() {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;

    const siteId = Number(process.env.NEXT_PUBLIC_HOTJAR_SITE_ID) || 6491927;
    const hotjarVersion = Number(process.env.NEXT_PUBLIC_HOTJAR_VERSION) || 6;

    try {
      Hotjar.init(siteId, hotjarVersion);
      initializedRef.current = true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Hotjar initialization failed:", error);
    }
  }, []);

  return null;
}


