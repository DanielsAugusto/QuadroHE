/**
 * Mensagens de erro para o cliente (OWASP A05).
 * Erros de infraestrutura/SQLite nunca vazam para a API.
 */
const INTERNAL = /SQLITE|constraint failed|UNIQUE constraint|FOREIGN KEY|NOT NULL constraint|datatype mismatch|no such table|no such column|errno|ECONN|EACCES|EPERM|stack:|\\node_modules\\/i;

export function clientErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) {
    if (err != null && process.env.NODE_ENV !== "test") console.error(err);
    return fallback;
  }
  const msg = err.message.trim();
  if (!msg || msg.length > 220 || INTERNAL.test(msg)) {
    if (process.env.NODE_ENV !== "test") console.error(err);
    return fallback;
  }
  return msg;
}
