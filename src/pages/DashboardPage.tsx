import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  EmptyState,
  ErrorBanner,
  PageHeader,
  Panel,
  StatCard,
  btnSecondary,
} from "@/components/ui";
import { api } from "@/lib/api";
import type { SaldoProfessor } from "@/lib/types";

const PAGE_SIZE = 10;

type DashboardData = {
  professores: number;
  escolas: number;
  heTotal: number;
  heExpirada?: number;
  alocTotal: number;
  heAbertas: number;
  carenciaTotal: number;
  carenciaAberta: number;
  inconsistentes: SaldoProfessor[];
};

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api<DashboardData>("/dashboard")
      .then((res) => {
        setData(res);
        setPage(1);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Erro ao carregar"),
      );
  }, []);

  const inconsistentes = data?.inconsistentes ?? [];
  const totalPages = Math.max(1, Math.ceil(inconsistentes.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paginaAtual = useMemo(() => {
    const start = (pageSafe - 1) * PAGE_SIZE;
    return inconsistentes.slice(start, start + PAGE_SIZE);
  }, [inconsistentes, pageSafe]);

  const inicio =
    inconsistentes.length === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1;
  const fim = Math.min(pageSafe * PAGE_SIZE, inconsistentes.length);

  if (!data && !error) {
    return <p className="text-sm text-muted">Carregando dashboard...</p>;
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Visão geral da hora extra autorizada e dos tempos alocados nas escolas."
        actions={
          <>
            <Link to="/hora-extra" className={btnSecondary}>
              Nova HE
            </Link>
            <Link to="/carencias" className={btnSecondary}>
              Carências
            </Link>
          </>
        }
      />
      <ErrorBanner message={error} />
      {data ? (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Professores" value={data.professores} />
            <StatCard label="Escolas" value={data.escolas} />
            <StatCard
              label="HE autorizada (tempos)"
              value={data.heTotal}
              tone="ok"
            />
            <StatCard
              label="Tempos alocados"
              value={data.alocTotal}
              tone={data.alocTotal > data.heTotal ? "danger" : "default"}
            />
          </div>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="HE abertas / vigentes" value={data.heAbertas} />
            <StatCard
              label="HE expirada"
              value={data.heExpirada ?? 0}
              tone={(data.heExpirada ?? 0) > 0 ? "danger" : "default"}
            />
            <StatCard
              label="Carência total"
              value={data.carenciaTotal ?? 0}
            />
            <StatCard
              label="Carência em aberto"
              value={data.carenciaAberta ?? 0}
              tone={(data.carenciaAberta ?? 0) > 0 ? "warn" : "ok"}
            />
            <StatCard
              label="Alertas de saldo"
              value={data.inconsistentes.length}
              tone={data.inconsistentes.length ? "warn" : "ok"}
            />
          </div>
          <Panel>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold text-brand-dark">
                  Professores com atenção
                </h2>
                <p className="text-sm text-muted">
                  Saldo negativo (alocou mais que a HE) ou HE sem alocação.
                </p>
              </div>
              {inconsistentes.length > 0 ? (
                <p className="text-sm text-muted">
                  Mostrando {inicio}–{fim} de {inconsistentes.length}
                </p>
              ) : null}
            </div>
            {inconsistentes.length === 0 ? (
              <EmptyState message="Nenhum alerta no momento." />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-border text-muted">
                      <tr>
                        <th className="px-2 py-2 font-medium">Matrícula</th>
                        <th className="px-2 py-2 font-medium">Nome</th>
                        <th className="px-2 py-2 font-medium">HE</th>
                        <th className="px-2 py-2 font-medium">Alocado</th>
                        <th className="px-2 py-2 font-medium">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginaAtual.map((s) => (
                        <tr
                          key={s.matricula}
                          className="border-b border-border/70"
                        >
                          <td className="px-2 py-2">
                            <Link
                              to={`/professores/${s.matricula}`}
                              className="text-brand underline-offset-2 hover:underline"
                            >
                              {s.matricula}
                            </Link>
                          </td>
                          <td className="px-2 py-2">{s.nome}</td>
                          <td className="px-2 py-2">{s.heAutorizada}</td>
                          <td className="px-2 py-2">{s.temposAlocados}</td>
                          <td
                            className={`px-2 py-2 font-medium ${
                              s.saldo < 0 ? "text-danger" : "text-warn"
                            }`}
                          >
                            {s.saldo}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted">
                    Página {pageSafe} de {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={btnSecondary}
                      disabled={pageSafe <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      className={btnSecondary}
                      disabled={pageSafe >= totalPages}
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              </>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
