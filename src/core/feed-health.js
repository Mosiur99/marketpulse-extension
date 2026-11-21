export const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;

export function isDue(state, now) {
  return !state?.nextAttemptAt || now >= state.nextAttemptAt;
}

export function recordSuccess(state, { etag, lastModified, itemCount, notModified }, now) {
  return {
    etag: etag ?? state?.etag ?? null,
    lastModified: lastModified ?? state?.lastModified ?? null,
    lastSuccessAt: now,
    lastErrorAt: state?.lastErrorAt ?? null,
    lastError: null,
    failures: 0,
    nextAttemptAt: 0,
    lastItemCount: notModified ? state?.lastItemCount ?? 0 : itemCount,
  };
}

export function recordFailure(state, { message, retryAfterMs }, now, intervalMs) {
  const failures = (state?.failures ?? 0) + 1;
  const backoff = Math.min(intervalMs * 2 ** failures, MAX_BACKOFF_MS);
  const wait = Math.min(Math.max(backoff, retryAfterMs ?? 0), MAX_BACKOFF_MS);
  return {
    etag: state?.etag ?? null,
    lastModified: state?.lastModified ?? null,
    lastSuccessAt: state?.lastSuccessAt ?? null,
    lastErrorAt: now,
    lastError: message,
    failures,
    nextAttemptAt: now + wait,
    lastItemCount: state?.lastItemCount ?? 0,
  };
}
