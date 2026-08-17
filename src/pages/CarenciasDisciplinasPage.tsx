import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  EmptyState,
  ErrorBanner,
  PageHeader,
  Panel,
  btnSecondary,
} from "@/components/ui";
import { api } from "@/lib/api";
import type { Turno } from "@/lib/types";

export type DisciplinaQuadroItem = {
  id: string;
  escola_id: string;
  escola_nome: string;
  turma_codigo: string;
  turmas: string[];
  turno: Turno;
  total_slots: number;
  slots_abertos: number;
  slots_preview?: Array<{
    dia: number;
    periodo: number;
    matricula: string | null;
    tipo?: string | null;
    modalidade_cobertura?: string | null;
  }>;
};

export type DisciplinaResumo = {
  disciplina_id: string;
  codigo: string;
  nome: string;
  quadros: number;
  abertos: number;
  escolas_count: number;
  itens: DisciplinaQuadroItem[];
};

export function disciplinaKey(d: Pick<DisciplinaResumo, "disciplina_id" | "codigo" | "nome">) {
  return d.disciplina_id || encodeURIComponent(`__${d.codigo}|${d.nome}`);
}

export function CarenciasDisciplinasPage() {
  const location = useLocation();
  const [disciplinas, setDisciplinas] = useState<DisciplinaResumo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const lista = await api<DisciplinaResumo[]>("/carencias/disciplinas-resumo");
      setDisciplinas(lista);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Carências - DOC I por disciplina"
        description="Visão das carências agrupadas por matéria. Abra uma disciplina para ver todos os quadros."
        actions={
          <>
            <Link to="/carencias/doc1" className={btnSecondary}>
              Por escola
            </Link>
            <Link to="/carencias" className={btnSecondary}>
              Voltar
            </Link>
          </>
        }
      />
      <ErrorBanner message={error} />

      {disciplinas.length === 0 ? (
        <EmptyState message="Nenhuma disciplina com quadro de carência. Adicione escolas e quadros na visão por escola." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {disciplinas.map((d) => {
            const key = disciplinaKey(d);
            const label = d.codigo !== "—" ? d.codigo : d.nome;
            return (
              <Panel key={key} className="flex flex-col gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold text-brand-dark">
                    {label}
                  </h2>
                  {d.codigo !== "—" && d.nome !== d.codigo && (
                    <p className="mt-0.5 text-sm text-muted">{d.nome}</p>
                  )}
                  <p className="mt-2 text-sm text-muted">
                    {d.quadros} quadro(s) · {d.escolas_count} escola(s) ·{" "}
                    {d.abertos} tempo(s) em aberto
                  </p>
                </div>
                <div className="mt-auto">
                  <Link
                    to={`/carencias/doc1/disciplinas/${key}`}
                    state={{ from: `${location.pathname}${location.search}` }}
                    className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
                  >
                    Ver quadros
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
