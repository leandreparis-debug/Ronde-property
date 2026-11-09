/** Share of the quota above which the device warns and asks before a new offline photo. */
export const QUOTA_WARNING_RATIO = 0.8;

/** What the browser says about the storage of the origin. */
export interface StorageUsage {
  usageBytes: number;
  quotaBytes: number | null;
  /** 0 to 1, `null` when the quota is unknown. */
  ratio: number | null;
  nearQuota: boolean;
  persisted: boolean | null;
}

/** Pure computation shared by the hook and the tests. */
export function computeUsage(
  usage: number | undefined,
  quota: number | undefined,
  persisted: boolean | null,
): StorageUsage {
  const usageBytes = usage ?? 0;
  const quotaBytes = quota && quota > 0 ? quota : null;
  const ratio = quotaBytes ? Math.min(1, usageBytes / quotaBytes) : null;
  return {
    usageBytes,
    quotaBytes,
    ratio,
    nearQuota: ratio !== null && ratio >= QUOTA_WARNING_RATIO,
    persisted,
  };
}

/** Reads `navigator.storage.estimate()`; a browser without it reports an unknown quota. */
export async function estimateUsage(): Promise<StorageUsage> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return computeUsage(undefined, undefined, null);
  }
  const estimate = await navigator.storage.estimate();
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
  return computeUsage(estimate.usage, estimate.quota, persisted);
}

/**
 * Asks the browser to keep the storage of the origin (no eviction under pressure). Chrome
 * grants it to installed applications; Safari decides by itself. Never throws.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** « 1,2 Go », « 340 Mo », « 12 Ko ». */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Go`;
}
