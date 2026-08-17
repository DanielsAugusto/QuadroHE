import { useCallback, useDeferredValue, useEffect, useState } from "react";
import {
  EmptyState,
  ErrorBanner,
  Field,
  Panel,
  btnSecondary,
  inputClass,
} from "@/components/ui";
import { api } from "@/lib/api";
import type { Paginated } from "@/lib/types";

const PAGE_SIZE = 30;

type AuditLog = {
  id: string;
  created_at: string;
  user_id: string | null;
  user_email: string | null;
  user_nome: string | null;
  categoria: string;
  acao: string;
  entidade: string | null;
  entidade_id: string | null;
  resumo: string;
  detalhes: string | null;
};

type FiltroOpcao = { id: string; total: number };

type LogsFiltros = {
  categorias: FiltroOpcao[];
  acoes: FiltroOpcao[];
};

const ACAO_LABEL: Record<string, string> = {
  criar: "Cadastro",
  editar: "Edição",
  excluir: "Exclusão",
  importar: "Importação",
  inativar: "Inativação",
  reativar: "Reativação",
  atribuir: "Atribuição",
  remover: "Remoção",
  licenca_abrir: "Licença aberta",
  licenca_encerrar: "Licença encerrada",
  login: "Login",
  login_falha: "Login recusado",
  logout: "Logout",
  authz_negada: "Acesso recusado",
  alerta: "Alerta de segurança",
  mfa: "Verificação em duas etapas",
  outro: "Outro",
};

const ACAO_TONE: Record<string, string> = {
  criar: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  editar: "bg-sky-100 text-sky-800 ring-sky-200",
  excluir: "bg-red-100 text-red-800 ring-red-200",
  importar: "bg-violet-100 text-violet-800 ring-violet-200",
  inativar: "bg-amber-100 text-amber-900 ring-amber-200",
  reativar: "bg-lime-100 text-lime-900 ring-lime-200",
  atribuir: "bg-brand-soft text-brand-dark ring-brand/30",
  remover: "bg-orange-100 text-orange-900 ring-orange-200",
  licenca_abrir: "bg-fuchsia-100 text-fuchsia-900 ring-fuchsia-200",
  licenca_encerrar: "bg-pink-100 text-pink-900 ring-pink-200",
  login: "bg-slate-100 text-slate-800 ring-slate-200",
  login_falha: "bg-red-100 text-red-800 ring-red-200",
  logout: "bg-slate-100 text-slate-700 ring-slate-200",
  authz_negada: "bg-red-100 text-red-800 ring-red-200",
  alerta: "bg-red-200 text-red-900 ring-red-300",
  mfa: "bg-indigo-100 text-indigo-800 ring-indigo-200",
};

const CAT_LABEL: Record<string, string> = {
  hora_extra: "Hora Extra",
  carencia: "Carência",
  professores: "Professores",
  escolas: "Escolas",
  disciplinas: "Disciplinas",
  alocacoes: "Alocações",
  sistema: "Sistema",
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const raw = value.includes("T") ? value : value.replace(" ", "T");
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function chipClass(ativo: boolean) {
  return `rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
    ativo
      ? "bg-brand text-white"
      : "border border-border bg-white text-foreground hover:bg-brand-soft/40"
  }`;
}

export function ConfigLogsPage() {
  const [itens, setItens] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<string>("todas");
  const [acao, setAcao] = useState<string>("todas");
  const [filtros, setFiltros] = useState<LogsFiltros>({
    categorias: [],
    acoes: [],
  });
  const [error, setError] = useState<string | null>(null);
  const buscaDeferred = useDeferredValue(busca);

  const loadFiltros = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (categoria !== "todas") params.set("categoria", categoria);
      const qs = params.toString();
      const res = await api<LogsFiltros>(
        `/logs/filtros${qs ? `?${qs}` : ""}`,
      );
      setFiltros(res);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao carregar filtros",
      );
    }
  }, [categoria]);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (categoria !== "todas") params.set("categoria", categoria);
      if (acao !== "todas") params.set("acao", acao);
      if (buscaDeferred.trim()) params.set("q", buscaDeferred.trim());
      const res = await api<Paginated<AuditLog>>(`/logs?${params.toString()}`);
      setItens(res.items);
      setTotal(res.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar logs");
    }
  }, [page, categoria, acao, buscaDeferred]);

  useEffect(() => {
    void loadFiltros();
  }, [loadFiltros]);

  useEffect(() => {
    if (acao !== "todas" && !filtros.acoes.some((a) => a.id === acao)) {
      setAcao("todas");
      setPage(1);
    }
  }, [filtros.acoes, acao]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const inicio = total === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1;
  const fim = Math.min(pageSafe * PAGE_SIZE, total);

  const temFiltro =
    busca.trim() || categoria !== "todas" || acao !== "todas";

  return (
    <div>
      <ErrorBanner message={error} />

      <Panel>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="w-full max-w-md">
            <Field label="Pesquisar">
              <input
                className={inputClass}
                placeholder="Usuário, resumo, matrícula..."
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPage(1);
                }}
              />
            </Field>
          </div>
          <p className="text-sm text-muted">
            {total === 0
              ? "Nenhum log"
              : `Mostrando ${inicio}–${fim} de ${total}`}
          </p>
        </div>

        <div className="mb-3 space-y-2">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Área
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className={chipClass(categoria === "todas")}
                onClick={() => {
                  setCategoria("todas");
                  setAcao("todas");
                  setPage(1);
                }}
              >
                Todas
                {filtros.categorias.length > 0
                  ? ` (${filtros.categorias.reduce((a, c) => a + c.total, 0)})`
                  : ""}
              </button>
              {filtros.categorias.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={chipClass(categoria === c.id)}
                  onClick={() => {
                    setCategoria(c.id);
                    setAcao("todas");
                    setPage(1);
                  }}
                >
                  {CAT_LABEL[c.id] ?? c.id} ({c.total})
                </button>
              ))}
            </div>
          </div>

          {filtros.acoes.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                Ação
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={chipClass(acao === "todas")}
                  onClick={() => {
                    setAcao("todas");
                    setPage(1);
                  }}
                >
                  Todas
                </button>
                {filtros.acoes.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={chipClass(acao === a.id)}
                    onClick={() => {
                      setAcao(a.id);
                      setPage(1);
                    }}
                  >
                    {ACAO_LABEL[a.id] ?? a.id} ({a.total})
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <p className="mb-3 text-xs text-muted">
          Filtros de área e ação aparecem conforme o que já foi registrado nos
          logs.
        </p>

        {total === 0 ? (
          <EmptyState
            message={
              temFiltro
                ? "Nenhum log para esse filtro."
                : "Ainda não há logs registrados."
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border text-muted">
                  <tr>
                    <th className="px-2 py-2 font-medium">Quando</th>
                    <th className="px-2 py-2 font-medium">Quem</th>
                    <th className="px-2 py-2 font-medium">Área</th>
                    <th className="px-2 py-2 font-medium">Ação</th>
                    <th className="px-2 py-2 font-medium">Resumo</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((log) => (
                    <tr key={log.id} className="border-b border-border/70">
                      <td className="px-2 py-2 whitespace-nowrap text-xs text-muted">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-medium">
                          {log.user_nome ?? "—"}
                        </div>
                        <div className="text-xs text-muted">
                          {log.user_email ?? ""}
                        </div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {CAT_LABEL[log.categoria] ?? log.categoria}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${
                            ACAO_TONE[log.acao] ??
                            "bg-background text-foreground ring-border"
                          }`}
                        >
                          {ACAO_LABEL[log.acao] ?? log.acao}
                        </span>
                      </td>
                      <td className="px-2 py-2">{log.resumo}</td>
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
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Próxima
                </button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
