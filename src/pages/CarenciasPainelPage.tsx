import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  EmptyState,
  ErrorBanner,
  PageHeader,
  btnSecondary,
} from "@/components/ui";
import { api } from "@/lib/api";

type Contagem = {
  real: number;
  temporaria: number;
  he_real: number;
  he_temporaria: number;
};

type DisciplinaCol = {
  key: string;
  disciplina_id: string;
  codigo: string;
  nome: string;
};

type EscolaLinha = {
  n: number;
  escola_id: string;
  escola_nome: string;
  por_disciplina: Record<string, Contagem>;
  total: Contagem;
  total_geral: number;
  observacoes: string;
};

type PainelData = {
  disciplinas: DisciplinaCol[];
  escolas: EscolaLinha[];
  totais: Contagem;
  totais_por_disciplina: Record<string, Contagem>;
  total_geral: number;
};

type ColMetric = "real" | "temporaria" | "he_real" | "he_temporaria";

const METRICAS: Array<{ id: ColMetric; label: string; short: string }> = [
  { id: "real", label: "Real", short: "REAL" },
  { id: "temporaria", label: "Temporária", short: "TEMP." },
  { id: "he_real", label: "HE Real", short: "HE REAL" },
  { id: "he_temporaria", label: "HE Temporária", short: "HE TEMP." },
];

/** Ordem e cores do print do mapa de carências. */
const DISC_STYLE: Record<string, { head: string; total: string; order: number }> = {
  PT: { order: 0, head: "bg-pink-300", total: "bg-pink-200" },
  MAT: { order: 1, head: "bg-lime-300", total: "bg-lime-200" },
  HIS: { order: 2, head: "bg-violet-300", total: "bg-violet-200" },
  CIE: { order: 3, head: "bg-yellow-300", total: "bg-yellow-200" },
  GEO: { order: 4, head: "bg-sky-300", total: "bg-sky-200" },
  ART: { order: 5, head: "bg-fuchsia-300", total: "bg-fuchsia-200" },
  ING: { order: 6, head: "bg-orange-300", total: "bg-orange-200" },
  EF: { order: 7, head: "bg-cyan-300", total: "bg-cyan-200" },
};

const DISC_FALLBACK = { head: "bg-[#d8ebee]", total: "bg-[#e8f4f6]", order: 99 };

/** Cores sólidas (sem transparência) para colunas sticky não vazarem o scroll. */
const BG_SURFACE = "bg-[#fffdf8]";
const BG_ROW_ALT = "bg-[#f3f0ea]";
const BG_SOFT = "bg-[#d8ebee]";
const BG_SOFT_ALT = "bg-[#e8f4f6]";
const STICKY_EDGE = "shadow-[2px_0_0_0_#d7d0c4]";

function estiloDisc(codigo: string) {
  return DISC_STYLE[codigo.toUpperCase()] ?? DISC_FALLBACK;
}

function isDoc2(d: Pick<DisciplinaCol, "codigo" | "nome">) {
  const c = d.codigo.toUpperCase().replace(/\s+/g, "");
  const n = d.nome.toUpperCase();
  return c === "DOCII" || n.includes("DOC II") || n.includes("DOCENTE II");
}

function emptyContagem(): Contagem {
  return { real: 0, temporaria: 0, he_real: 0, he_temporaria: 0 };
}

function somaVisivel(c: Contagem, visiveis: Set<ColMetric>) {
  let n = 0;
  if (visiveis.has("real")) n += c.real;
  if (visiveis.has("temporaria")) n += c.temporaria;
  if (visiveis.has("he_real")) n += c.he_real;
  if (visiveis.has("he_temporaria")) n += c.he_temporaria;
  return n;
}

function cellNum(n: number, destaque = false) {
  if (n === 0) return <span className="text-muted/40">0</span>;
  return (
    <span className={destaque ? "font-bold text-red-600" : "text-red-600"}>
      {n}
    </span>
  );
}

export function CarenciasPainelPage() {
  const [data, setData] = useState<PainelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [colunas, setColunas] = useState<Set<ColMetric>>(
    () => new Set(["real", "temporaria"]),
  );
  const [painelFiltro, setPainelFiltro] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<PainelData>("/carencias/painel");
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const metricasVisiveis = useMemo(
    () => METRICAS.filter((m) => colunas.has(m.id)),
    [colunas],
  );

  const disciplinas = useMemo(() => {
    if (!data) return [];
    return [...data.disciplinas]
      .filter((d) => !isDoc2(d))
      .sort(
        (a, b) =>
          estiloDisc(a.codigo).order - estiloDisc(b.codigo).order ||
          a.nome.localeCompare(b.nome, "pt-BR"),
      );
  }, [data]);

  const colsPorDisc = metricasVisiveis.length + 1; // + TOTAL

  function toggleColuna(id: ColMetric) {
    setColunas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const escolas = useMemo(() => {
    if (!data) return [];
    return data.escolas
      .map((e) => {
        const total = emptyContagem();
        for (const d of disciplinas) {
          const c = e.por_disciplina[d.key] ?? emptyContagem();
          total.real += c.real;
          total.temporaria += c.temporaria;
          total.he_real += c.he_real;
          total.he_temporaria += c.he_temporaria;
        }
        const totalVisivel = somaVisivel(total, colunas);
        return { ...e, total, totalVisivel };
      })
      .filter((e) => e.totalVisivel > 0)
      .map((e, i) => ({ ...e, n: i + 1 }));
  }, [data, colunas, disciplinas]);

  const totaisVisiveis = useMemo(() => {
    const t = emptyContagem();
    for (const e of escolas) {
      t.real += e.total.real;
      t.temporaria += e.total.temporaria;
      t.he_real += e.total.he_real;
      t.he_temporaria += e.total.he_temporaria;
    }
    return t;
  }, [escolas]);

  const mediaProfessores = somaVisivel(totaisVisiveis, colunas) / 30;

  return (
    <div>
      <PageHeader
        title="Painel de carências — DOC I"
        description="Controle por escola e disciplina. Só aparecem escolas com total maior que zero nas colunas selecionadas."
        actions={
          <>
            <Link to="/carencias/doc1" className={btnSecondary}>
              Por escola
            </Link>
            <Link to="/carencias/doc1/disciplinas" className={btnSecondary}>
              Por disciplina
            </Link>
            <Link to="/carencias" className={btnSecondary}>
              Voltar
            </Link>
          </>
        }
      />
      <ErrorBanner message={error} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <button
            type="button"
            className="cursor-pointer rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium transition hover:bg-brand-soft/40"
            onClick={() => setPainelFiltro((v) => !v)}
          >
            Colunas ({metricasVisiveis.length}/{METRICAS.length})
          </button>
          {painelFiltro && (
            <div className="absolute left-0 z-30 mt-1 w-56 rounded-md border border-border bg-surface p-2 shadow-lg">
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Exibir colunas
              </p>
              {METRICAS.map((m) => (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-brand-soft/30"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                    checked={colunas.has(m.id)}
                    onChange={() => toggleColuna(m.id)}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <span className="text-xs text-muted">
          Padrão: Real e Temporária. HE Real / HE Temporária = cobertos em Hora
          Extra.
        </span>
      </div>

      {!data ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : escolas.length === 0 ? (
        <EmptyState message="Nenhuma escola com carência nas colunas selecionadas." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
          <table className="min-w-max border-collapse text-center text-[11px]">
            <thead>
              <tr>
                <th
                  rowSpan={3}
                  className={`sticky left-0 z-20 border border-border px-2 py-1 font-bold text-brand-dark ${BG_SOFT}`}
                >
                  Nº
                </th>
                <th
                  rowSpan={3}
                  className={`sticky left-8 z-20 min-w-[200px] border border-border px-3 py-1 text-left font-bold text-brand-dark ${BG_SOFT} ${STICKY_EDGE}`}
                >
                  UNIDADE ESCOLAR
                </th>
                {disciplinas.map((d) => {
                  const cor = estiloDisc(d.codigo);
                  return (
                    <th
                      key={d.key}
                      colSpan={colsPorDisc}
                      className={`border border-border px-2 py-1.5 font-bold uppercase tracking-wide ${cor.head}`}
                    >
                      {d.codigo !== "—" ? `${d.codigo} — ${d.nome}` : d.nome}
                    </th>
                  );
                })}
                <th
                  colSpan={colsPorDisc}
                  className="border border-border bg-[#b8dce1] px-2 py-1.5 font-bold uppercase text-brand-dark"
                >
                  TOTAL DE TEMPOS EM CARÊNCIA
                </th>
                <th
                  rowSpan={3}
                  className={`min-w-[160px] border border-border px-2 py-1 font-bold uppercase text-brand-dark ${BG_SOFT}`}
                >
                  OBSERVAÇÕES
                </th>
              </tr>
              <tr>
                {disciplinas.map((d) => {
                  const cor = estiloDisc(d.codigo);
                  return (
                    <th
                      key={`car-${d.key}`}
                      colSpan={colsPorDisc}
                      className={`border border-border px-1 py-0.5 text-[10px] font-semibold ${cor.total}`}
                    >
                      CARÊNCIA
                    </th>
                  );
                })}
                <th
                  colSpan={colsPorDisc}
                  className={`border border-border px-1 py-0.5 text-[10px] font-semibold text-brand-dark ${BG_SOFT}`}
                >
                  CARÊNCIA
                </th>
              </tr>
              <tr>
                {disciplinas.map((d) => {
                  const cor = estiloDisc(d.codigo);
                  return (
                    <FragmentCols
                      key={`m-${d.key}`}
                      metricas={metricasVisiveis}
                      totalClass={cor.total}
                    />
                  );
                })}
                <FragmentCols
                  metricas={metricasVisiveis}
                  totalClass={BG_SOFT}
                />
              </tr>
            </thead>
            <tbody>
              {escolas.map((e, rowIdx) => {
                const zebra = rowIdx % 2 === 1 ? BG_ROW_ALT : BG_SURFACE;
                return (
                  <tr key={e.escola_id} className={zebra}>
                    <td
                      className={`sticky left-0 z-10 border border-border px-2 py-1 ${zebra}`}
                    >
                      {e.n}
                    </td>
                    <td
                      className={`sticky left-8 z-10 border border-border px-3 py-1 text-left font-medium ${zebra} ${STICKY_EDGE}`}
                    >
                      <Link
                        to={`/carencias/doc1/${e.escola_id}`}
                        className="text-brand hover:underline"
                      >
                        {e.escola_nome}
                      </Link>
                    </td>
                    {disciplinas.map((d) => {
                      const cor = estiloDisc(d.codigo);
                      const c = e.por_disciplina[d.key] ?? emptyContagem();
                      return (
                        <ContagemCells
                          key={`${e.escola_id}-${d.key}`}
                          c={c}
                          metricas={metricasVisiveis}
                          totalClass={cor.total}
                        />
                      );
                    })}
                    <ContagemCells
                      c={e.total}
                      metricas={metricasVisiveis}
                      totalClass={BG_SOFT_ALT}
                      forte
                    />
                    <td className="border border-border px-2 py-1 text-left text-[10px] text-red-700">
                      {e.observacoes || ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className={`${BG_SOFT_ALT} font-semibold`}>
                <td
                  colSpan={2}
                  className={`sticky left-0 z-10 border border-border px-3 py-1.5 text-left text-brand-dark ${BG_SOFT_ALT} ${STICKY_EDGE}`}
                >
                  TOTAL EM TEMPOS
                </td>
                {disciplinas.map((d) => {
                  const cor = estiloDisc(d.codigo);
                  const cont = emptyContagem();
                  for (const e of escolas) {
                    const x = e.por_disciplina[d.key] ?? emptyContagem();
                    cont.real += x.real;
                    cont.temporaria += x.temporaria;
                    cont.he_real += x.he_real;
                    cont.he_temporaria += x.he_temporaria;
                  }
                  return (
                    <ContagemCells
                      key={`t-${d.key}`}
                      c={cont}
                      metricas={metricasVisiveis}
                      totalClass={cor.total}
                      forte
                    />
                  );
                })}
                <ContagemCells
                  c={totaisVisiveis}
                  metricas={metricasVisiveis}
                  totalClass={BG_SOFT}
                  forte
                />
                <td className="border border-border" />
              </tr>
              <tr className={BG_ROW_ALT}>
                <td
                  colSpan={2}
                  className={`sticky left-0 z-10 border border-border px-3 py-1.5 text-left text-xs font-medium ${BG_ROW_ALT} ${STICKY_EDGE}`}
                >
                  MÉDIA DE PROFESSORES (30 tempos)
                </td>
                <td
                  colSpan={
                    disciplinas.length * colsPorDisc + colsPorDisc + 1
                  }
                  className="border border-border px-3 py-1.5 text-left text-sm font-semibold text-brand-dark"
                >
                  {mediaProfessores.toLocaleString("pt-BR", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function FragmentCols({
  metricas,
  totalClass,
}: {
  metricas: typeof METRICAS;
  totalClass: string;
}) {
  return (
    <>
      {metricas.map((m) => (
        <th
          key={m.id}
          className={`border border-border px-1.5 py-1 text-[10px] font-semibold ${BG_SURFACE}`}
        >
          {m.short}
        </th>
      ))}
      <th
        className={`border border-border px-1.5 py-1 text-[10px] font-bold ${totalClass}`}
      >
        TOTAL
      </th>
    </>
  );
}

function ContagemCells({
  c,
  metricas,
  totalClass,
  forte = false,
}: {
  c: Contagem;
  metricas: typeof METRICAS;
  totalClass: string;
  forte?: boolean;
}) {
  const total = metricas.reduce((acc, m) => acc + c[m.id], 0);
  return (
    <>
      {metricas.map((m) => (
        <td key={m.id} className="border border-border px-1.5 py-1 tabular-nums">
          {cellNum(c[m.id])}
        </td>
      ))}
      <td
        className={`border border-border px-1.5 py-1 tabular-nums ${totalClass}`}
      >
        {cellNum(total, forte)}
      </td>
    </>
  );
}
