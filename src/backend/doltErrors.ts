// src/backend/doltErrors.ts

/** True when a bd error indicates embedded Dolt's single-writer lock is held. */
export function isEmbeddedLockError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("exclusive lock") ||
    m.includes("supports only one writer") ||
    m.includes("another process holds")
  );
}
