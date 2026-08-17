import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  EmptyState,
  ErrorBanner,
  PageHeader,
  Panel,
  btnPrimary,
  btnSecondary,
} from "@/components/ui";
import { api } from "@/lib/api";
import {
  DIAS,
  PERIODOS,
  TURNO_HEADER,
  TURNO_LABEL,
  type Quadro,
  type Turno,
} from "@/lib/types";
import {
  disciplinaKey,
  type DisciplinaResumo,
} from "@/pages/CarenciasDisciplinasPage";

const TURNOS_FILTRO: Turno[] = ["MANHA", "TARDE", "NOITE"];

function MiniGrade({ quadro }: { quadro: Pick<Quadro, "turno" | "slots_preview"> }) {
  const map = useMemo(() => {
    const m = new Map<
      string,
      { matricula: string | null; tipo: string | null; modalidade_cobertura: string | null }
    >();
    for (const s of quadro.slots_preview ?? []) {
      m.set(`${s.dia}:${s.periodo}`, {
        matricula: s.matricula,
        tipo: s.tipo ?? "REAL",
        modalidade_cobertura: s.modalidade_cobertura ?? null,
      });
    }
    return m;
  }, [quadro.slots_preview]);

  return (
    <div className="overflow-hidden rounded-md border border-border bg-white">
      <div
        className={`px-2 py-1 text-center text-[10px] font-bold tracking-wide text-white ${TURNO_HEADER[quadro.turno]}`}
      >
        {TURNO_LABEL[quadro.turno]}
      </div>
      <table className="w-full border-collapse text-center text-[9px]">
        <thead>
          <tr>
            <th className="w-5 border-b border-border p-0.5 text-muted" />
            {DIAS.map((d) => (
              <th key={d.id} className="border-b border-border p-0.5 font-medium text-muted">
                {d.label.slice(0, 1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIODOS.map((periodo) => (
            <tr key={periodo}>
              <td className="border-t border-border p-0.5 text-muted">{periodo}</td>
              {DIAS.map((d) => {
                const slot = map.get(`${d.id}:${periodo}`);
                if (!slot) {
                  return <td key={d.id} className="border-l border-t border-border bg-white p-0.5" />;
                }
                const coberta = !!slot.matricula;
                const temporaria = slot.tipo === "TEMPORARIA";
                const isHoraNormal = slot.modalidade_cobertura === "NORMAL";
                let cellClass = "bg-sky-200";
                if (coberta && temporaria && isHoraNormal) cellClass = "bg-amber-200";
                else if (coberta && temporaria) cellClass = "bg-orange-200";
                else if (coberta && isHoraNormal) cellClass = "bg-teal-200";
                else if (coberta) cellClass = "bg-emerald-200";
                else if (temporaria) cellClass = "bg-rose-200";
                return (
                  <td
                    key={d.id}
                    className={`border-l border-t border-border p-0.5 ${cellClass}`}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CarenciasDisciplinaEscolasPage() {
  const { disciplinaId } = useParams();
  const location = useLocation();
  const [disciplinas, setDisciplinas] = useState<DisciplinaResumo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [turnosFiltro, setTurnosFiltro] = useState<Set<Turno>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const lista = await api<DisciplinaResumo[]>("/carencias/disciplinas-resumo");
      setDisciplinas(lista);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const disciplina = useMemo(() => {
    if (!disciplinaId) return null;
    const decoded = decodeURIComponent(disciplinaId);
    return (
      disciplinas.find((d) => disciplinaKey(d) === disciplinaId) ??
      disciplinas.find((d) => disciplinaKey(d) === decoded) ??
      disciplinas.find((d) => d.disciplina_id === disciplinaId) ??
      null
    );
  }, [disciplinas, disciplinaId]);

  const itensFiltrados = useMemo(() => {
    if (!disciplina) return [];
    if (turnosFiltro.size === 0) return disciplina.itens;
    return disciplina.itens.filter((q) => turnosFiltro.has(q.turno));
  }, [disciplina, turnosFiltro]);

  function toggleTurno(turno: Turno) {
    setTurnosFiltro((prev) => {
      const next = new Set(prev);
      if (next.has(turno)) next.delete(turno);
      else next.add(turno);
      return next;
    });
  }

  const label = disciplina
    ? disciplina.codigo !== "—"
      ? disciplina.codigo
      : disciplina.nome
    : "…";

  return (
    <div>
      <PageHeader
        title={disciplina ? `${label}${disciplina.codigo !== "—" ? ` — ${disciplina.nome}` : ""}` : "Disciplina"}
        description={
          disciplina
            ? `${disciplina.quadros} quadro(s) · ${disciplina.escolas_count} escola(s) · ${disciplina.abertos} tempo(s) em aberto`
            : "Carregando quadros desta disciplina…"
        }
        actions={
          <>
            <Link
              to={
                (location.state as { from?: string } | null)?.from ??
                "/carencias/doc1/disciplinas"
              }
              className={btnSecondary}
            >
              Voltar às disciplinas
            </Link>
            <Link to="/carencias/doc1" className={btnSecondary}>
              Por escola
            </Link>
          </>
        }
      />
      <ErrorBanner message={error} />

      {disciplina && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted">Turno:</span>
          {TURNOS_FILTRO.map((turno) => {
            const ativo = turnosFiltro.has(turno);
            return (
              <button
                key={turno}
                type="button"
                className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                  ativo
                    ? "border-brand bg-brand text-white"
                    : "border-border bg-white text-foreground hover:bg-brand-soft/40"
                }`}
                aria-pressed={ativo}
                onClick={() => toggleTurno(turno)}
              >
                {TURNO_LABEL[turno]}
              </button>
            );
          })}
          {turnosFiltro.size > 0 && (
            <>
              <button
                type="button"
                className="cursor-pointer text-xs font-medium text-brand hover:underline"
                onClick={() => setTurnosFiltro(new Set())}
              >
                Limpar
              </button>
              <span className="text-xs text-muted">
                {itensFiltrados.length} de {disciplina.itens.length} quadro(s)
              </span>
            </>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : !disciplina ? (
        <EmptyState message="Disciplina não encontrada ou sem quadros." />
      ) : disciplina.itens.length === 0 ? (
        <EmptyState message="Nenhum quadro desta disciplina." />
      ) : itensFiltrados.length === 0 ? (
        <EmptyState message="Nenhum quadro nos turnos selecionados." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {itensFiltrados.map((q) => {
            const turmasLabel = (q.turmas?.length ? q.turmas : [q.turma_codigo]).join(" · ");
            return (
              <Panel key={q.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-brand-dark">
                      {turmasLabel}
                    </h2>
                    <p className="text-sm text-muted">
                      {q.escola_nome} · {TURNO_LABEL[q.turno]}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted">
                    <p>
                      <span className="font-semibold text-foreground">{q.total_slots}</span>{" "}
                      tempos
                    </p>
                    <p className="text-warn">{q.slots_abertos} em aberto</p>
                  </div>
                </div>

                <MiniGrade quadro={q} />

                <div className="mt-auto pt-1">
                  <Link
                    to={`/carencias/doc1/${q.escola_id}/${q.id}`}
                    state={{ from: `${location.pathname}${location.search}` }}
                    className={`${btnPrimary} w-full`}
                  >
                    Abrir
                  </Link>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
