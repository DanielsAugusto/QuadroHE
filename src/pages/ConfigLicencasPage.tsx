import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  IconCheckButton,
  IconCloseButton,
  IconDeleteButton,
  Panel,
  btnSecondary,
  inputClass,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  STATUS_LICENCA_LABEL,
  formatDateBR,
  isLicencaAtiva,
  type Paginated,
  type StatusLicenca,
} from "@/lib/types";

const PAGE_SIZE = 20;

type FiltroStatus = "todas" | "ativas" | "inativas";

type LicencaGrupo = {
  id: string;
  ids: string[];
  matricula: string;
  professor_nome?: string | null;
  inicio: string;
  retorno_previsto: string;
  encerrada_em?: string | null;
  motivo?: string | null;
  status: StatusLicenca;
  ativo?: number | boolean | null;
  inativado_em?: string | null;
  escola_nome?: string | null;
  turma_codigo?: string | null;
  turno?: string | null;
  disciplina_codigo?: string | null;
  tempos: number;
};

export function ConfigLicencasPage() {
  const { isAdmin } = useAuth();
  const [itens, setItens] = useState<LicencaGrupo[]>([]);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todas");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pendingInativar, setPendingInativar] = useState<LicencaGrupo | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<LicencaGrupo | null>(null);
  const [pendingReativar, setPendingReativar] = useState<LicencaGrupo | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const buscaDeferred = useDeferredValue(busca);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        incluir_inativas: "1",
      });
      if (buscaDeferred.trim()) params.set("q", buscaDeferred.trim());
      if (filtroStatus === "ativas") params.set("status", "ativas");
      if (filtroStatus === "inativas") params.set("status", "inativas");
      const data = await api<Paginated<LicencaGrupo>>(
        `/licencas?${params.toString()}`,
      );
      setItens(data.items);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    }
  }, [page, buscaDeferred, filtroStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const inicio = total === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1;
  const fim = Math.min(pageSafe * PAGE_SIZE, total);

  async function confirmarInativar() {
    if (!pendingInativar) return;
    setSaving(true);
    try {
      await api("/licencas/inativar", {
        method: "POST",
        body: JSON.stringify({ ids: pendingInativar.ids }),
      });
      setPendingInativar(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao inativar");
      setPendingInativar(null);
    } finally {
      setSaving(false);
    }
  }

  async function confirmarReativar() {
    if (!pendingReativar) return;
    setSaving(true);
    try {
      await api("/licencas/reativar", {
        method: "POST",
        body: JSON.stringify({ ids: pendingReativar.ids }),
      });
      setPendingReativar(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao reativar");
      setPendingReativar(null);
    } finally {
      setSaving(false);
    }
  }

  async function confirmarExclusao() {
    if (!pendingDelete) return;
    setSaving(true);
    try {
      await api("/licencas/excluir", {
        method: "POST",
        body: JSON.stringify({ ids: pendingDelete.ids }),
      });
      setPendingDelete(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir");
      setPendingDelete(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <ErrorBanner message={error} />

      <Panel>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex w-full max-w-xl flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Field label="Pesquisar">
                <input
                  className={inputClass}
                  placeholder="Professor, matrícula, escola, turma…"
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value);
                    setPage(1);
                  }}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "todas" as const, label: "Todas" },
                  { id: "ativas" as const, label: "Ativas" },
                  { id: "inativas" as const, label: "Inativas" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setFiltroStatus(t.id);
                    setPage(1);
                  }}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                    filtroStatus === t.id
                      ? "bg-brand text-white"
                      : "border border-border bg-white text-foreground hover:bg-brand-soft/40"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-muted">
            {total === 0
              ? "Nenhum resultado"
              : `Mostrando ${inicio}–${fim} de ${total}`}
          </p>
        </div>

        <p className="mb-3 text-xs text-muted">
          Nas ativas, o X inativa (fica no histórico da ficha como inativa).
          Depois de inativa, o ✓ reativa e a lixeira apaga de vez.
        </p>

        {total === 0 ? (
          <EmptyState
            message={
              busca.trim() || filtroStatus !== "todas"
                ? "Nenhuma licença encontrada para esse filtro."
                : "Nenhuma licença registrada."
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border text-muted">
                  <tr>
                    <th className="px-2 py-2 font-medium">Situação</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Motivo</th>
                    <th className="px-2 py-2 font-medium">Matrícula</th>
                    <th className="px-2 py-2 font-medium">Nome</th>
                    <th className="px-2 py-2 font-medium">Início</th>
                    <th className="px-2 py-2 font-medium">Retorno</th>
                    <th className="px-2 py-2 font-medium">Turmas</th>
                    <th className="px-2 py-2 font-medium">Disc.</th>
                    <th className="px-2 py-2 font-medium">Tempos</th>
                    <th className="px-2 py-2 font-medium">Inativada em</th>
                    <th className="px-2 py-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((l) => {
                    const ativa = isLicencaAtiva(l);
                    return (
                      <tr
                        key={l.ids.join("-")}
                        className={`border-b border-border/70 ${
                          ativa ? "" : "bg-amber-50/70"
                        }`}
                      >
                        <td className="px-2 py-2 whitespace-nowrap">
                          {ativa ? (
                            <span className="inline-flex rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                              Ativa
                            </span>
                          ) : (
                            <span className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
                              Inativa
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {STATUS_LICENCA_LABEL[l.status] ?? l.status}
                        </td>
                        <td className="px-2 py-2 max-w-[12rem]" title={l.motivo || undefined}>
                          {l.motivo || "—"}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {l.matricula}
                        </td>
                        <td className="px-2 py-2">
                          <Link
                            to={`/professores/${l.matricula}?tab=licencas`}
                            state={{ from: "/configuracao?tab=licencas" }}
                            className="text-brand underline-offset-2 hover:underline"
                          >
                            {l.professor_nome ?? l.matricula}
                          </Link>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {formatDateBR(l.inicio)}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {formatDateBR(l.retorno_previsto)}
                        </td>
                        <td className="px-2 py-2">{l.turma_codigo || "—"}</td>
                        <td className="px-2 py-2">
                          {l.disciplina_codigo || "—"}
                        </td>
                        <td className="px-2 py-2 font-medium">{l.tempos}</td>
                        <td className="px-2 py-2 whitespace-nowrap text-muted">
                          {ativa
                            ? "—"
                            : formatDateBR(
                                l.inativado_em
                                  ? String(l.inativado_em).slice(0, 10)
                                  : null,
                              )}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            {ativa ? (
                              <IconCloseButton
                                label={`Inativar licença de ${l.professor_nome ?? l.matricula}`}
                                title="Inativar"
                                onClick={() => setPendingInativar(l)}
                              />
                            ) : (
                              <>
                                <IconCheckButton
                                  label={`Reativar licença de ${l.professor_nome ?? l.matricula}`}
                                  title="Reativar"
                                  onClick={() => setPendingReativar(l)}
                                />
                                {isAdmin ? (
                                  <IconDeleteButton
                                    label={`Excluir licença de ${l.professor_nome ?? l.matricula}`}
                                    title="Excluir permanentemente"
                                    onClick={() => setPendingDelete(l)}
                                  />
                                ) : null}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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

      <ConfirmDialog
        open={!!pendingInativar}
        title="Inativar licença"
        message={
          pendingInativar
            ? `Inativar a licença de ${pendingInativar.professor_nome ?? pendingInativar.matricula} (${pendingInativar.tempos} tempo(s), turmas ${pendingInativar.turma_codigo || "—"})? Ela fica marcada como inativa na ficha.`
            : ""
        }
        confirmLabel="Inativar"
        loading={saving}
        onConfirm={() => void confirmarInativar()}
        onClose={() => {
          if (!saving) setPendingInativar(null);
        }}
      />

      <ConfirmDialog
        open={!!pendingReativar}
        title="Reativar licença"
        message={
          pendingReativar
            ? `Reativar a licença de ${pendingReativar.professor_nome ?? pendingReativar.matricula} (${pendingReativar.tempos} tempo(s))?`
            : ""
        }
        confirmLabel="Reativar"
        loading={saving}
        onConfirm={() => void confirmarReativar()}
        onClose={() => {
          if (!saving) setPendingReativar(null);
        }}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Excluir licença"
        message={
          pendingDelete
            ? `Excluir permanentemente a licença de ${pendingDelete.professor_nome ?? pendingDelete.matricula} (${pendingDelete.tempos} tempo(s))? Ela some da ficha. Esta ação não pode ser desfeita.`
            : ""
        }
        confirmLabel="Excluir"
        loading={saving}
        onConfirm={() => void confirmarExclusao()}
        onClose={() => {
          if (!saving) setPendingDelete(null);
        }}
      />
    </div>
  );
}
