/**
 * Decodifica CSV/planilha em texto, escolhendo UTF-8 ou Windows-1252.
 * Relatórios brasileiros (folha/lotação) costumam vir em Windows-1252.
 */
export function decodeSpreadsheetText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }

  const asUtf8 = new TextDecoder("utf-8").decode(bytes);
  const as1252 = new TextDecoder("windows-1252").decode(bytes);

  return scoreDecodedText(as1252) >= scoreDecodedText(asUtf8) ? as1252 : asUtf8;
}

function scoreDecodedText(text: string): number {
  let score = 0;
  const sample = text.slice(0, 8000);

  score -= (sample.match(/\uFFFD/g) ?? []).length * 80;
  score -= (sample.match(/\u00ef\u00bf\u00bd/g) ?? []).length * 80;
  score -= (sample.match(/Ã[\u0080-\u00ff]/g) ?? []).length * 25;
  score -= (sample.match(/Â[\u0080-\u00ff]/g) ?? []).length * 15;
  score += (sample.match(/[ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç]/g) ?? []).length * 8;

  return score;
}

/** Sequência literal "ï¿½" (UTF-8 de U+FFFD lido como latin1). */
const BROKEN = "\u00ef\u00bf\u00bd";

/**
 * Corrige textos já gravados com encoding quebrado (ç/acentos → ï¿½ / �).
 */
export function repairMojibakeText(
  input: string | null | undefined,
): string | null {
  if (input == null) return null;
  let s = String(input);
  if (!s) return s;

  // UTF-8 lido como windows-1252/latin1 (ex.: Ã§ → ç)
  if (/Ã.|Â./.test(s) && !s.includes(BROKEN)) {
    try {
      const bytes = Uint8Array.from({ length: s.length }, (_, i) =>
        s.charCodeAt(i) & 0xff,
      );
      const fixed = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (fixed && !fixed.includes("\uFFFD")) s = fixed;
    } catch {
      /* mantém */
    }
  }

  if (!s.includes(BROKEN) && !s.includes("\uFFFD")) return s;

  s = s.split(BROKEN).join("\uFFFD");

  const pairs: Array<[RegExp, string]> = [
    [/CONCEI\uFFFD\uFFFDO/gi, "CONCEIÇÃO"],
    [/APLICA\uFFFD\uFFFDO/gi, "APLICAÇÃO"],
    [/EDUCA\uFFFD\uFFFDO/gi, "EDUCAÇÃO"],
    [/RELA\uFFFD\uFFFDES/gi, "RELAÇÕES"],
    [/LICITA\uFFFD\uFFFDES/gi, "LICITAÇÕES"],
    [/ILUMINA\uFFFD\uFFFDO/gi, "ILUMINAÇÃO"],
    [/FUN\uFFFD\uFFFDES/gi, "FUNÇÕES"],
    [/PROMO\uFFFDAO/gi, "PROMOÇÃO"],
    [/PRODU\uFFFDAO/gi, "PRODUÇÃO"],
    [/INCLUS\uFFFDO/gi, "INCLUSÃO"],
    [/GOVERNAN\uFFFDA/gi, "GOVERNANÇA"],
    [/ESPERAN\uFFFDA/gi, "ESPERANÇA"],
    [/FINAN\uFFFDA/gi, "FINANÇA"],
    [/CRIAN\uFFFDA/gi, "CRIANÇA"],
    [/CRIANCA/gi, "CRIANÇA"],
    [/ITAIPUA\uFFFDU/gi, "ITAIPUAÇU"],
    [/EDUCA\uFFFDAO/gi, "EDUCAÇÃO"],
    [/MERO\uFFFD/gi, "MERENDA"],
    [/CI\uFFFDNCIAS/gi, "CIÊNCIAS"],
    [/CI\uFFFDNCIA/gi, "CIÊNCIA"],
    [/AN\uFFFDSIO/gi, "ANÍSIO"],
    [/SP\uFFFDNOLA/gi, "SPÍNOLA"],
    [/JO\uFFFDO/gi, "JOÃO"],
    [/JOS\uFFFD/gi, "JOSÉ"],
    [/S\uFFFDO\b/gi, "SÃO"],
    [/MARIC\uFFFD/gi, "MARICÁ"],
    [/INO\uFFFD\b/gi, "INOÃ"],
    [/AMANH\uFFFD/gi, "AMANHÃ"],
    [/INF\uFFFDNCIA/gi, "INFÂNCIA"],
    [/ATL\uFFFDNTICA/gi, "ATLÂNTICA"],
    [/SIM\uFFFDES/gi, "SIMÕES"],
    [/ALCEB\uFFFDADE/gi, "ALCEBÍADE"],
    [/CL\uFFFDRIO/gi, "CLÉRIO"],
    [/THOM\uFFFD/gi, "THOMÉ"],
    [/L\uFFFDA\b/gi, "LÍDA"],
    [/CORR\uFFFDA/gi, "CORRÊA"],
    [/LET\uFFFDCIA/gi, "LETÍCIA"],
    [/MAUR\uFFFDCIO/gi, "MAURÍCIO"],
    [/MAR\uFFFDLIA/gi, "MARÍLIA"],
    [/SIDN\uFFFDIA/gi, "SIDNÉIA"],
    [/VAL\uFFFDRIA/gi, "VALÉRIA"],
    [/D\uFFFD R\uFFFD MI/gi, "DÓ RÉ MI"],
    [/HIST\uFFFDRIA/gi, "HISTÓRIA"],
    [/INGL\uFFFD\b/gi, "INGLÊS"],
    [/L\uFFFDNGUA/gi, "LÍNGUA"],
    [/MATEM\uFFFDTICA/gi, "MATEMÁTICA"],
    [/PEDAG\uFFFDGICO/gi, "PEDAGÓGICO"],
    [/EDUC F\uFFFD\b/gi, "EDUC FÍS"],
    [/F\uFFFDSICA/gi, "FÍSICA"],
    [/SECRET\uFFFDRIO/gi, "SECRETÁRIO"],
    [/REFOR\uFFFDO/gi, "REFORÇO"],
    [/LICEN\uFFFDA/gi, "LICENÇA"],
    [/ENSINO MEDIO\b/gi, "ENSINO MÉDIO"],
    [/PRE-ESCOLA/gi, "PRÉ-ESCOLA"],

    // Genéricos seguros
    [/A\uFFFDA/g, "AÇA"],
    [/C\uFFFDA/g, "ÇA"],
    [/C\uFFFDO/g, "ÇO"],
    [/C\uFFFDU/g, "ÇU"],
    [/A\uFFFDO/g, "ÃO"],
    [/E\uFFFDES/g, "ÕES"],
    [/O\uFFFDES/g, "ÕES"],
  ];

  for (const [re, to] of pairs) {
    s = s.replace(re, to);
  }

  // Vogal + � + consoante → acento comum em nomes PT
  s = s.replace(/([AEIOU])\uFFFD([A-Z])/g, (_, a: string, b: string) => {
    const table: Record<string, string> = {
      AS: "ÁS",
      AR: "ÁR",
      AN: "ÂN",
      AL: "ÁL",
      AC: "ÁC",
      AT: "ÁT",
      AD: "ÁD",
      AB: "ÁB",
      AG: "ÁG",
      AM: "ÁM",
      ER: "ÉR",
      EN: "ÊN",
      EL: "ÉL",
      EC: "ÉC",
      ET: "ÉT",
      ED: "ÉD",
      EB: "ÉB",
      EG: "ÉG",
      EM: "ÉM",
      ES: "ÊS",
      IS: "ÍS",
      IR: "ÍR",
      IN: "ÍN",
      IL: "ÍL",
      IC: "ÍC",
      IT: "ÍT",
      ID: "ÍD",
      IB: "ÍB",
      IG: "ÍG",
      IM: "ÍM",
      ON: "ÔN",
      OL: "ÓL",
      OC: "ÓC",
      OT: "ÓT",
      OD: "ÓD",
      OG: "ÓG",
      OM: "ÓM",
      OE: "ÕE",
      UR: "ÚR",
      UL: "ÚL",
      UN: "ÚN",
    };
    return table[`${a}${b}`] ?? `${a}\uFFFD${b}`;
  });

  return s;
}

export function repairMojibakeValue(value: unknown): unknown {
  if (typeof value === "string") return repairMojibakeText(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const nk = repairMojibakeText(k) ?? k;
      out[nk] = typeof v === "string" ? repairMojibakeText(v) : v;
    }
    return out;
  }
  return value;
}
