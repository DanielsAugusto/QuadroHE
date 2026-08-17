import type { Request } from "express";
import { writeAuditLog } from "./audit.js";
import { db } from "./db.js";

let lastRunAt = 0;
const MIN_INTERVAL_MS = 30_000;

/** Uso em testes: libera o throttle para a próxima execução. */
export function resetHeExpiryThrottle() {
  lastRunAt = 0;
}

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Inativa HEs ativas cujo término já passou (termino < hoje).
 * Throttle curto para não repetir em toda requisição.
 */
export function inativarHorasExtraExpiradas(req?: Request, force = false) {
  const now = Date.now();
  if (!force && now - lastRunAt < MIN_INTERVAL_MS) return 0;
  lastRunAt = now;

  const today = todayISO();
  const result = db
    .prepare(
      `update horas_extra
       set ativo = 0,
           inativado_em = datetime('now'),
           updated_at = datetime('now')
       where ifnull(ativo, 1) = 1
         and termino is not null
         and trim(termino) != ''
         and date(substr(termino, 1, 10)) < date(?)`,
    )
    .run(today);

  const n = Number(result.changes);
  if (n > 0) {
    writeAuditLog({
      req,
      categoria: "hora_extra",
      acao: "inativar",
      entidade: "horas_extra",
      resumo: `Inativação automática: ${n} HE(s) com término anterior a ${today}`,
      detalhes: { inativadas: n, motivo: "termino_expirado", hoje: today },
    });
  }
  return n;
}
