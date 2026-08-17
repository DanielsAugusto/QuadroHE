import { db } from "./db.js";

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

function nowMs() {
  return Date.now();
}

export function isLoginLocked(email: string): boolean {
  const row = db
    .prepare(
      `select falhas, locked_until from login_lockouts where email = ?`,
    )
    .get(email) as { falhas: number; locked_until: number | null } | undefined;
  if (!row) return false;
  const until = Number(row.locked_until ?? 0);
  return until > nowMs();
}

/** Registra falha. `alert` é true na tentativa que dispara o bloqueio. */
export function registerLoginFailure(email: string): {
  locked: boolean;
  alert: boolean;
} {
  const row = db
    .prepare(
      `select falhas, locked_until from login_lockouts where email = ?`,
    )
    .get(email) as { falhas: number; locked_until: number | null } | undefined;

  const until = Number(row?.locked_until ?? 0);
  if (until > nowMs()) {
    return { locked: true, alert: false };
  }

  const falhas = Number(row?.falhas ?? 0) + 1;
  const locked = falhas >= MAX_FAILURES;
  const lockedUntil = locked ? nowMs() + LOCK_MS : 0;

  if (row) {
    db.prepare(
      `update login_lockouts
       set falhas = ?, locked_until = ?, updated_at = datetime('now')
       where email = ?`,
    ).run(falhas, lockedUntil, email);
  } else {
    db.prepare(
      `insert into login_lockouts (email, falhas, locked_until, updated_at)
       values (?, ?, ?, datetime('now'))`,
    ).run(email, falhas, lockedUntil);
  }

  return { locked, alert: locked && falhas === MAX_FAILURES };
}

export function clearLoginFailures(email: string) {
  db.prepare("delete from login_lockouts where email = ?").run(email);
}

export function resetLoginLockouts() {
  db.exec("delete from login_lockouts");
}
