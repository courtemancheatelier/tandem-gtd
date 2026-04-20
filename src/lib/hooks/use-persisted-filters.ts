"use client";

/**
 * Persists filter state to localStorage per page.
 * URL params take priority on initial load; localStorage is the fallback
 * when navigating back to a page without params.
 */

const STORAGE_PREFIX = "tandem:filters:";

export type FilterMap = Record<string, string | null>;

/**
 * Save filters to localStorage for a given page key.
 */
export function saveFilters(pageKey: string, filters: FilterMap): void {
  try {
    // Strip null/empty values before saving
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v) clean[k] = v;
    }
    if (Object.keys(clean).length > 0) {
      localStorage.setItem(STORAGE_PREFIX + pageKey, JSON.stringify(clean));
    } else {
      localStorage.removeItem(STORAGE_PREFIX + pageKey);
    }
  } catch {
    // localStorage unavailable (SSR, private browsing)
  }
}

/**
 * Load filters from localStorage for a given page key.
 * Returns null if nothing saved.
 */
export function loadFilters(pageKey: string): FilterMap | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + pageKey);
    if (!raw) return null;
    return JSON.parse(raw) as FilterMap;
  } catch {
    return null;
  }
}

/**
 * Clear saved filters for a given page key.
 */
export function clearFilters(pageKey: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + pageKey);
  } catch {
    // ignore
  }
}

/**
 * Check if URL has any filter params. If not, check localStorage
 * and return saved params to restore.
 */
export function getInitialFilters(
  pageKey: string,
  searchParams: URLSearchParams,
  paramKeys: string[]
): FilterMap | null {
  // If URL already has filter params, don't override — URL wins
  const hasUrlFilters = paramKeys.some((k) => searchParams.has(k));
  if (hasUrlFilters) return null;

  // No URL params — try localStorage
  return loadFilters(pageKey);
}
