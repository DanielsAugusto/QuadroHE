import * as XLSX from "xlsx";

export type CarenciaImportItem = {
  escola: string;
  turma_codigo: string;
  turno: "MANHA" | "TARDE" | "NOITE";
  dia: number;
  periodo: number;
  disciplina_codigo: string;
  observacao?: string;
};

function norm(v: unknown): string {
  return String(v ?? "")
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isDiscMarker(v: unknown): boolean {
  const s = norm(v).toUpperCase();
  return (/\bLP\b/.test(s) && /\bPT\b/.test(s)) || s === "LP" || s === "PT";
}

function looksLikeSchool(name: string): boolean {
  const s = name.trim();
  if (!s || s.length < 3) return false;
  if (/^(ATESTADO|TEMPOS|SAÍDA|SAIDA|PARA |IDOSO|NOVO )/i.test(s)) return false;
  if (/\bMAT\.?\s*\d/.test(s)) return false;
  if (
    /\(\d{4,}\)/.test(s) &&
    !/^(EM|E M|CEM|CEPT|CAIC|CIE|CME|CIEP)/i.test(s)
  ) {
    return false;
  }
  return true;
}

function mapDiscCodigo(raw: string): string | null {
  if (/\bPT\b/i.test(raw)) return "PT";
  if (/\bLP\b/i.test(raw)) return "PT";
  return null;
}

function parseTurma(
  raw: unknown,
): { turma: string; disc: string | null } | null {
  const s = norm(raw);
  if (!s) return null;
  if (
    /^(TOTAL|MANH|TARDE|NOITE|SEGUNDA|TERÇA|TERCA|QUARTA|QUINTA|SEXTA)/i.test(s)
  ) {
    return null;
  }
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) < 20 && !/^\d{3,}$/.test(s)) {
    return null;
  }

  const m = s.match(/^([A-Za-zÀ-ÿ0-9]+)(?:\s*[-–]\s*(?:LP|PT))?$/i);
  if (m) {
    const turma = m[1].toUpperCase();
    if (turma === "TOTAL") return null;
    return { turma, disc: mapDiscCodigo(s) };
  }

  const m2 = s.match(/^(\d{3,}|[A-Z]{2,}\d*)/i);
  if (!m2) return null;
  return { turma: m2[1].toUpperCase(), disc: mapDiscCodigo(s) };
}

function turnFrom(label: string, fallback: "MANHA" | "TARDE" | "NOITE") {
  const s = label.toUpperCase();
  if (s.includes("MANH")) return "MANHA" as const;
  if (s.includes("TARDE")) return "TARDE" as const;
  if (s.includes("NOITE")) return "NOITE" as const;
  return fallback;
}

function defaultDiscFromTitle(rows: unknown[][]): string {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const joined = (rows[i] ?? []).map(norm).join(" ").toUpperCase();
    if (/PORTUGUES|PORTUGUÊS|L[IÍ]NGUA\s+PORTUG/.test(joined)) return "PT";
    if (/MATEM[AÁ]TICA/.test(joined)) return "MAT";
    if (/HIST[OÓ]RIA/.test(joined)) return "HIS";
    if (/GEOGRAFIA/.test(joined)) return "GEO";
    if (/CI[EÊ]NCIAS/.test(joined)) return "CIE";
    if (/EDUCA[CÇ][AÃ]O\s+F[IÍ]SICA/.test(joined)) return "EF";
    if (/\bARTE\b/.test(joined)) return "ART";
    if (/INGL[EÊ]S/.test(joined)) return "ING";
  }
  return "PT";
}

/**
 * Lê a planilha visual de carências (blocos por escola × manhã/tarde/noite,
 * grade SEG–SEX × 1º–6º com códigos de turma nas células).
 */
export function parseCarenciasPlanilha(buffer: ArrayBuffer): CarenciaImportItem[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!sheet) throw new Error("Planilha vazia");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });
  if (rows.length === 0) throw new Error("Nenhuma linha encontrada na planilha");

  const defaultDisc = defaultDiscFromTitle(rows);
  const itens: CarenciaImportItem[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (!isDiscMarker(r[1]) && !isDiscMarker(r[12])) continue;

    let escolaManha = isDiscMarker(r[1]) ? norm(r[2]) : "";
    let escolaTarde = isDiscMarker(r[12]) ? norm(r[13]) : "";
    if (escolaManha && !looksLikeSchool(escolaManha)) escolaManha = "";
    if (escolaTarde && !looksLikeSchool(escolaTarde)) escolaTarde = "";
    if (!escolaManha && !escolaTarde) continue;

    let dayRow = -1;
    for (let j = i + 1; j <= i + 6 && j < rows.length; j++) {
      const row = rows[j] ?? [];
      const a = norm(row[2]).toUpperCase();
      const b = norm(row[13]).toUpperCase();
      if (a.startsWith("SEGUN") || b.startsWith("SEGUN")) {
        dayRow = j;
        break;
      }
    }
    if (dayRow < 0) continue;

    const next = rows[i + 1] ?? [];
    const obs = (norm(next[2]) || norm(next[13])).slice(0, 200);
    const tl = rows[dayRow - 1] ?? [];
    const manhaLabel = norm(tl[2]);
    const tardeLabel = norm(tl[13]);
    const noiteLabel = norm(tl[20]);

    type Sec = {
      escola: string;
      turno: "MANHA" | "TARDE" | "NOITE";
      cols: number[];
    };
    const secs: Sec[] = [];

    if (escolaManha) {
      secs.push({
        escola: escolaManha,
        turno: turnFrom(manhaLabel, "MANHA"),
        cols: [2, 3, 4, 5, 6],
      });
    }
    if (escolaTarde) {
      secs.push({
        escola: escolaTarde,
        turno: turnFrom(tardeLabel, "TARDE"),
        cols: [13, 14, 15, 16, 17],
      });
    }
    if (noiteLabel.toUpperCase().includes("NOITE")) {
      const rawNoite = norm(r[20]);
      const escolaNoite = looksLikeSchool(rawNoite)
        ? rawNoite
        : escolaTarde || escolaManha;
      if (escolaNoite) {
        secs.push({
          escola: escolaNoite,
          turno: "NOITE",
          cols: [20, 21, 22, 23, 24],
        });
      }
    }

    for (let p = 0; p < 6; p++) {
      const pr = rows[dayRow + 1 + p];
      if (!pr) break;
      const periodo = p + 1;
      const pMark = norm(pr[1]) || norm(pr[12]);
      if (pMark && !/^\d/.test(pMark) && !/[º°]/.test(pMark)) break;

      for (const sec of secs) {
        for (let di = 0; di < 5; di++) {
          const parsed = parseTurma(pr[sec.cols[di]]);
          if (!parsed) continue;
          itens.push({
            escola: sec.escola,
            turma_codigo: parsed.turma,
            turno: sec.turno,
            dia: di + 1,
            periodo,
            disciplina_codigo: parsed.disc || defaultDisc,
            observacao: obs || undefined,
          });
        }
      }
    }
  }

  if (itens.length === 0) {
    throw new Error(
      "Nenhuma carência encontrada. Confira se a planilha tem blocos com LP/PT, nome da escola e grade SEG–SEX × 1º–6º.",
    );
  }

  return itens;
}
