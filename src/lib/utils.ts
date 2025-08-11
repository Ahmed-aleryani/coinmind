import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Returns the app base URL, preferring the env var but falling back to the browser origin.
export function getAppBaseUrl() {
  const envUrl = process.env.NEXT_PUBLIC_APP_BASE_URL
  if (envUrl && envUrl.length > 0) return envUrl
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return ''
}
