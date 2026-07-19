export type ThemeMode = "auto" | "light" | "dark";

export const THEME_STORAGE_KEY = "clinicos-theme";

/**
 * localStorage as an external store, read through useSyncExternalStore.
 *
 * Not a useState + useEffect pair: the stored mode is client-only, so reading
 * it in an effect means rendering the wrong selection first and correcting it
 * after paint. useSyncExternalStore models exactly this — a value the server
 * cannot know — and returns "auto" for the server snapshot, which is what the
 * pre-paint script also assumes when nothing is stored.
 */
const listeners = new Set<() => void>();

export function subscribeTheme(onChange: () => void): () => void {
  listeners.add(onChange);
  /* Keeps two tablets, or two tabs on the nurse station, in agreement. */
  window.addEventListener("storage", onChange);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function getStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "auto") {
      return stored;
    }
  } catch {
    /* Private-mode WebView. Fall through to the default. */
  }
  return "auto";
}

/** The server cannot know the device's stored preference. */
export function getServerTheme(): ThemeMode {
  return "auto";
}

export function setStoredTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* Applies for this session; it just will not persist. */
  }

  document.documentElement.classList.toggle(
    "dark",
    resolveTheme(mode, new Date().getHours()) === "dark",
  );

  for (const listener of listeners) listener();
}

/** 5pm–6am is Night OPD (§8.2). */
export function isEveningAt(hour: number): boolean {
  return hour >= 17 || hour < 6;
}

export function resolveTheme(mode: ThemeMode, hour: number): "light" | "dark" {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  return isEveningAt(hour) ? "dark" : "light";
}

/**
 * Runs before first paint, inlined in <head>.
 *
 * Without this the page renders light, then flips to dark once React hydrates
 * — a white flash in a darkened consultation room, which is precisely the
 * thing Night OPD exists to avoid. Kept as a string because it must execute
 * synchronously, ahead of the bundle.
 *
 * Wrapped in try/catch: localStorage throws in private-mode WebViews on some
 * budget Android builds, and a theme preference is never worth a blank screen.
 */
export const THEME_INIT_SCRIPT = `
(function(){
  try {
    var mode = localStorage.getItem('${THEME_STORAGE_KEY}') || 'auto';
    var hour = new Date().getHours();
    var evening = hour >= 17 || hour < 6;
    var dark = mode === 'dark' || (mode === 'auto' && evening);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;
