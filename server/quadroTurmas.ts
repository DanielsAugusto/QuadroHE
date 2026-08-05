/** Helpers para quadro com várias turmas (um registro, vários códigos). */

export function normalizeTurmas(input: unknown[]): string[] {
  const list = input
    .map((t) => String(t ?? "").trim())
    .filter(Boolean);
  return [...new Set(list)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function turmaLabel(turmas: string[]): string {
  return turmas.join("+");
}

export function parseTurmasJson(
  turmas_json: unknown,
  turma_codigo_fallback = "",
): string[] {
  if (typeof turmas_json === "string" && turmas_json.trim()) {
    try {
      const parsed = JSON.parse(turmas_json) as unknown;
      if (Array.isArray(parsed)) {
        const turmas = normalizeTurmas(parsed);
        if (turmas.length > 0) return turmas;
      }
    } catch {
      /* ignore */
    }
  }
  const fallback = String(turma_codigo_fallback ?? "").trim();
  if (!fallback) return [];
  return normalizeTurmas(fallback.split("+"));
}

export function hydrateQuadroRow<T extends Record<string, unknown>>(row: T) {
  const turma_codigo = String(row.turma_codigo ?? "");
  const turmas = parseTurmasJson(row.turmas_json, turma_codigo);
  return {
    ...row,
    turmas,
    turma_codigo: turma_codigo || turmaLabel(turmas),
  };
}
