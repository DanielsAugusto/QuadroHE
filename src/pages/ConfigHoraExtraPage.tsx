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
  Modal,
  Panel,
  btnPrimary,
  btnSecondary,
  inputClass,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  TIPO_HE_LABEL,
  formatDateBR,
  isHeAtiva,
  todayISO,
  type HoraExtra,
  type Paginated,
} from "@/lib/types";

const PAGE_SIZE = 20;

type FiltroStatus = "todas" | "ativas" | "inativas";

export function ConfigHoraExtraPage() {
  const { isAdmin } = useAuth();
  const [itens, setItens] = useState<HoraExtra[]>([]);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todas");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pendingInativar, setPendingInativar] = useState<HoraExtra | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HoraExtra | null>(null);
  const [pendingReativar, setPendingReativar] = useState<HoraExtra | null>(null);
  const [terminoReativar, setTerminoReativar] = useState("");
  const [semTerminoReativar, setSemTerminoReativar] = useState(false);
  const [erroReativar, setErroReativar] = useState<string | null>(null);
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
      const he = await api<Paginated<HoraExtra>>(
        `/horas-extra?${params.toString()}`,
      );
      setItens(he.items);
      setTotal(he.total);
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
      await api(`/horas-extra/${pendingInativar.id}/inativar`, {
        method: "POST",
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

  async function confirmarExclusao() {
    if (!pendingDelete) return;
    setSaving(true);
    try {
      await api(`/horas-extra/${pendingDelete.id}`, { method: "DELETE" });
      setPendingDelete(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir");
      setPendingDelete(null);
    } finally {
      setSaving(false);
    }
  }

  function abrirReativar(h: HoraExtra) {
    const hoje = todayISO();
    const atual = h.termino ? String(h.termino).slice(0, 10) : "";
    const semFim = !h.termino;
    setSemTerminoReativar(semFim);
    setTerminoReativar(semFim ? "" : atual && atual >= hoje ? atual : hoje);
    setErroReativar(null);
    setPendingReativar(h);
  }

  function fecharReativar() {
    if (saving) return;
    setPendingReativar(null);
    setTerminoReativar("");
    setSemTerminoReativar(false);
    setErroReativar(null);
  }

  async function confirmarReativar() {
    if (!pendingReativar) return;
    const termino = terminoReativar.trim();
    if (!semTerminoReativar) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(termino)) {
        setErroReativar("Informe a nova data de término.");
        return;
      }
      if (termino < todayISO()) {
        setErroReativar("A data de término deve ser hoje ou futura.");
        return;
      }
    }
    setSaving(true);
    setErroReativar(null);
    try {
      await api(`/horas-extra/${pendingReativar.id}/reativar`, {
        method: "POST",
        body: JSON.stringify(
          semTerminoReativar
            ? { termino: null, sem_termino: true }
            : { termino },
        ),
      });
      setPendingReativar(null);
      setTerminoReativar("");
      setSemTerminoReativar(false);
      setErroReativar(null);
      await load();
    } catch (err) {
      setErroReativar(err instanceof Error ? err.message : "Erro ao reativar");
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
                  placeholder="Professor, matrícula, memo..."
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
          Nas ativas, o X inativa (sai do relatório, fica no histórico). Depois
          de inativa, o ✓ reativa e a lixeira apaga de vez.
        </p>

        {total === 0 ? (
          <EmptyState
            message={
              busca.trim() || filtroStatus !== "todas"
                ? "Nenhuma HE encontrada para esse filtro."
                : "Nenhuma hora extra cadastrada."
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border text-muted">
                  <tr>
                    <th className="px-2 py-2 font-medium">Situação</th>
                    <th className="px-2 py-2 font-medium">Matrícula</th>
                    <th className="px-2 py-2 font-medium">Nome</th>
                    <th className="px-2 py-2 font-medium">Tempos</th>
                    <th className="px-2 py-2 font-medium">Tipo</th>
                    <th className="px-2 py-2 font-medium">Início</th>
                    <th className="px-2 py-2 font-medium">Término</th>
                    <th className="px-2 py-2 font-medium">Inativada em</th>
                    <th className="px-2 py-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((h) => {
                    const ativa = isHeAtiva(h);
                    return (
                      <tr
                        key={h.id}
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
                          {h.matricula}
                        </td>
                        <td className="px-2 py-2">
                          <Link
                            to={`/professores/${h.matricula}`}
                            state={{ from: "/configuracao?tab=hora-extra" }}
                            className="text-brand underline-offset-2 hover:underline"
                          >
                            {h.professor_nome ?? h.matricula}
                          </Link>
                        </td>
                        <td className="px-2 py-2 font-medium">
                          {h.tempos_autorizados}
                        </td>
                        <td className="px-2 py-2">{TIPO_HE_LABEL[h.tipo]}</td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {formatDateBR(h.inicio)}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {formatDateBR(h.termino)}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-muted">
                          {ativa
                            ? "—"
                            : formatDateBR(
                                h.inativado_em
                                  ? String(h.inativado_em).slice(0, 10)
                                  : null,
                              )}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            {ativa ? (
                              <IconCloseButton
                                label={`Inativar HE de ${h.professor_nome ?? h.matricula}`}
                                title="Inativar"
                                onClick={() => setPendingInativar(h)}
                              />
                            ) : (
                              <>
                                <IconCheckButton
                                  label={`Reativar HE de ${h.professor_nome ?? h.matricula}`}
                                  title="Reativar"
                                  onClick={() => abrirReativar(h)}
                                />
                                {isAdmin ? (
                                  <IconDeleteButton
                                    label={`Excluir HE de ${h.professor_nome ?? h.matricula}`}
                                    title="Excluir permanentemente"
                                    onClick={() => setPendingDelete(h)}
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
        title="Inativar hora extra"
        message={
          pendingInativar
            ? `Inativar a HE de ${pendingInativar.professor_nome ?? pendingInativar.matricula} (${pendingInativar.tempos_autorizados} tempos)? Ela sai do relatório e fica marcada como inativa.`
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
        open={!!pendingDelete}
        title="Excluir hora extra"
        message={
          pendingDelete
            ? `Excluir permanentemente a HE de ${pendingDelete.professor_nome ?? pendingDelete.matricula} (${pendingDelete.tempos_autorizados} tempos)? Ela some do relatório e da ficha do professor. Esta ação não pode ser desfeita.`
            : ""
        }
        confirmLabel="Excluir"
        loading={saving}
        onConfirm={() => void confirmarExclusao()}
        onClose={() => {
          if (!saving) setPendingDelete(null);
        }}
      />

      <Modal
        open={!!pendingReativar}
        title="Reativar hora extra"
        onClose={fecharReativar}
      >
        {pendingReativar ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Reativar a HE de{" "}
              <strong className="text-foreground">
                {pendingReativar.professor_nome ?? pendingReativar.matricula}
              </strong>{" "}
              ({pendingReativar.tempos_autorizados} tempos) para ela voltar ao
              relatório.
            </p>
            {pendingReativar.termino ? (
              <p className="text-xs text-muted">
                Término anterior: {formatDateBR(pendingReativar.termino)}
              </p>
            ) : (
              <p className="text-xs text-muted">Término anterior: sem data fim</p>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                checked={semTerminoReativar}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSemTerminoReativar(checked);
                  if (checked) {
                    setTerminoReativar("");
                  } else if (!terminoReativar) {
                    setTerminoReativar(todayISO());
                  }
                }}
              />
              Sem data de término
            </label>
            <Field label="Nova data de término">
              <input
                type="date"
                className={inputClass}
                min={todayISO()}
                value={terminoReativar}
                onChange={(e) => setTerminoReativar(e.target.value)}
                disabled={semTerminoReativar}
                required={!semTerminoReativar}
              />
            </Field>
            <ErrorBanner message={erroReativar} />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={btnSecondary}
                disabled={saving}
                onClick={fecharReativar}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={saving || (!semTerminoReativar && !terminoReativar)}
                onClick={() => void confirmarReativar()}
              >
                {saving ? "Reativando..." : "Reativar"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
