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
import {
  TIPO_HE_LABEL,
  formatDateBR,
  todayISO,
  type SaldoProfessor,
  type TipoHE,
} from "@/lib/types";

const PAGE_SIZE = 10;

type HeAVencer = {
  id: string;
  matricula: string;
  professor_nome: string;
  tempos_autorizados: number;
  tipo: TipoHE;
  termino: string;
};

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
  heAVencer?: HeAVencer[];
};

type FiltroPainel = "alertas" | "semana" | "mes" | "ano";

const FILTROS: Array<{ id: FiltroPainel; label: string }> = [
  { id: "alertas", label: "Alertas de saldo" },
  { id: "semana", label: "Vence na semana" },
  { id: "mes", label: "Vence no mês" },
  { id: "ano", label: "Vence no ano" },
];

function toISODate(d: Date) {
  return todayISO(d);
}

export function fimDaSemana(hoje = new Date()) {
  const end = new Date(hoje);
  const day = end.getDay(); // 0=dom
  const add = day === 0 ? 0 : 7 - day;
  end.setDate(end.getDate() + add);
  return toISODate(end);
}

export function fimDoMes(hoje = new Date()) {
  return toISODate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0));
}

export function fimDoAno(hoje = new Date()) {
  return `${hoje.getFullYear()}-12-31`;
}

function limiteFiltro(filtro: Exclude<FiltroPainel, "alertas">) {
  if (filtro === "semana") return fimDaSemana();
  if (filtro === "mes") return fimDoMes();
  return fimDoAno();
}

export function diasRestantes(termino: string, hoje = todayISO()) {
  const a = new Date(`${hoje}T12:00:00`);
  const b = new Date(`${termino}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filtro, setFiltro] = useState<FiltroPainel>("alertas");

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

  useEffect(() => {
    setPage(1);
  }, [filtro]);

  const inconsistentes = data?.inconsistentes ?? [];
  const heAVencer = data?.heAVencer ?? [];

  const contagensVencer = useMemo(() => {
    const hoje = todayISO();
    const count = (limite: string) =>
      heAVencer.filter((h) => h.termino >= hoje && h.termino <= limite).length;
    return {
      semana: count(fimDaSemana()),
      mes: count(fimDoMes()),
      ano: count(fimDoAno()),
    };
  }, [heAVencer]);

  const heFiltradas = useMemo(() => {
    if (filtro === "alertas") return [];
    const hoje = todayISO();
    const limite = limiteFiltro(filtro);
    return heAVencer.filter((h) => h.termino >= hoje && h.termino <= limite);
  }, [filtro, heAVencer]);

  const listaAlertas = filtro === "alertas";
  const totalItens = listaAlertas ? inconsistentes.length : heFiltradas.length;
  const totalPages = Math.max(1, Math.ceil(totalItens / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);

  const paginaAlertas = useMemo(() => {
    const start = (pageSafe - 1) * PAGE_SIZE;
    return inconsistentes.slice(start, start + PAGE_SIZE);
  }, [inconsistentes, pageSafe]);

  const paginaHe = useMemo(() => {
    const start = (pageSafe - 1) * PAGE_SIZE;
    return heFiltradas.slice(start, start + PAGE_SIZE);
  }, [heFiltradas, pageSafe]);

  const inicio = totalItens === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1;
  const fim = Math.min(pageSafe * PAGE_SIZE, totalItens);

  const descricaoPainel = listaAlertas
    ? "Saldo negativo (alocou mais que a HE) ou HE sem alocação."
    : filtro === "semana"
      ? "Horas extras ativas com término até o domingo desta semana."
      : filtro === "mes"
        ? "Horas extras ativas com término até o fim deste mês."
        : "Horas extras ativas com término até o fim deste ano.";

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
            <StatCard label="Funcionários" value={data.professores} />
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
            <div className="mb-4 flex flex-col gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-display text-xl font-semibold text-brand-dark">
                    {listaAlertas
                      ? "Professores com atenção"
                      : "Horas extras a vencer"}
                  </h2>
                  <p className="text-sm text-muted">{descricaoPainel}</p>
                </div>
                {totalItens > 0 ? (
                  <p className="text-sm text-muted">
                    Mostrando {inicio}–{fim} de {totalItens}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {FILTROS.map((f) => {
                  const count =
                    f.id === "alertas"
                      ? inconsistentes.length
                      : contagensVencer[f.id];
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFiltro(f.id)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                        filtro === f.id
                          ? "bg-brand text-white"
                          : "border border-border bg-white text-foreground hover:bg-brand-soft/40"
                      }`}
                    >
                      {f.label} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {totalItens === 0 ? (
              <EmptyState
                message={
                  listaAlertas
                    ? "Nenhum alerta no momento."
                    : "Nenhuma HE a vencer neste período."
                }
              />
            ) : listaAlertas ? (
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
                      {paginaAlertas.map((s) => (
                        <tr
                          key={s.matricula}
                          className="border-b border-border/70"
                        >
                          <td className="px-2 py-2">
                            <Link
                              to={`/professores/${s.matricula}`}
                              state={{ from: "/" }}
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
              </>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border text-muted">
                    <tr>
                      <th className="px-2 py-2 font-medium">Matrícula</th>
                      <th className="px-2 py-2 font-medium">Nome</th>
                      <th className="px-2 py-2 font-medium">Tempos</th>
                      <th className="px-2 py-2 font-medium">Tipo</th>
                      <th className="px-2 py-2 font-medium">Término</th>
                      <th className="px-2 py-2 font-medium">Restam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginaHe.map((h) => {
                      const dias = diasRestantes(h.termino);
                      return (
                        <tr key={h.id} className="border-b border-border/70">
                          <td className="px-2 py-2">
                            <Link
                              to={`/professores/${h.matricula}`}
                              state={{ from: "/" }}
                              className="text-brand underline-offset-2 hover:underline"
                            >
                              {h.matricula}
                            </Link>
                          </td>
                          <td className="px-2 py-2">{h.professor_nome}</td>
                          <td className="px-2 py-2">{h.tempos_autorizados}</td>
                          <td className="px-2 py-2">
                            {TIPO_HE_LABEL[h.tipo] ?? h.tipo}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            {formatDateBR(h.termino)}
                          </td>
                          <td
                            className={`px-2 py-2 font-medium ${
                              dias <= 7
                                ? "text-danger"
                                : dias <= 30
                                  ? "text-warn"
                                  : "text-foreground"
                            }`}
                          >
                            {dias === 0
                              ? "Hoje"
                              : dias === 1
                                ? "1 dia"
                                : `${dias} dias`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {totalItens > 0 ? (
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
            ) : null}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
