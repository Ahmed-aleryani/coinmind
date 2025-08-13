"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";

export function ModeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const current = (resolvedTheme || theme) as "light" | "dark" | undefined;
  const isLight = current === "light";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLight}
      aria-label="Toggle theme"
      title={isLight ? "Switch to dark" : "Switch to light"}
      onClick={() => setTheme(isLight ? "dark" : "light")}
      className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors duration-500 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background ${
        isLight ? "bg-muted" : "bg-muted"
      }`}
    >
      {/* Track Icons */}
      <div className="absolute left-3 flex items-center justify-center">
        <Moon className="h-4 w-4 opacity-60" />
      </div>
      <div className="absolute right-3 flex items-center justify-center">
        <Sun className="h-4 w-4 text-yellow-500 opacity-80" />
      </div>
      {/* Knob */}
      <motion.span
        className="pointer-events-none absolute left-0.5 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background shadow"
        animate={{ x: isLight ? 34 : 0 }}
        transition={{ type: "tween", duration: 0.6, ease: "easeInOut" }}
      >
        {isLight ? (
          <Sun className="h-4 w-4 text-yellow-500" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
      </motion.span>
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}


