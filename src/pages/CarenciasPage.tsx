import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  IconDeleteButton,
  Modal,
  PageHeader,
  Panel,
  btnPrimary,
  btnSecondary,
  inputClass,
} from "@/components/ui";
import { api } from "@/lib/api";
import { parseCarenciasPlanilha } from "@/lib/importCarenciasPlanilha";
import type { Escola } from "@/lib/types";

type Resumo = Escola & {
  quadros?: number;
  abertos?: number;
  por_disciplina?: Array<{ codigo: string; nome: string; abertos: number }>;
};
type ModoAdd = "existente" | "nova";

type ImportResult = {
  escolas_criadas: number;
  escolas_ativadas: number;
  quadros_criados: number;
  slots_criados: number;
  slots_existentes: number;
  ignorados: number;
  erros: string[];
};

export function CarenciasPage() {
  const [escolas, setEscolas] = useState<Resumo[]>([]);
  const [disponiveis, setDisponiveis] = useState<Escola[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modo, setModo] = useState<ModoAdd>("existente");
  const [escolaId, setEscolaId] = useState("");
  const [nome, setNome] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<Resumo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const lista = await api<Resumo[]>("/carencias/escolas-resumo");
      setEscolas(lista);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function abrirModal() {
    setNome("");
    setEscolaId("");
    setFormError(null);
    try {
      const semCarencia = await api<Escola[]>("/carencias/escolas-disponiveis");
      setDisponiveis(semCarencia);
      setModo(semCarencia.length > 0 ? "existente" : "nova");
    } catch {
      setDisponiveis([]);
      setModo("nova");
    }
    setModalOpen(true);
  }

  function fecharModal() {
    setModalOpen(false);
    setNome("");
    setEscolaId("");
    setFormError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFormError(null);
    try {
      if (modo === "existente") {
        if (!escolaId) {
          throw new Error("Selecione uma escola.");
        }
        await api(`/escolas/${escolaId}/carencias`, {
          method: "PATCH",
          body: JSON.stringify({ ativa: true }),
        });
      } else {
        await api("/escolas", {
          method: "POST",
          body: JSON.stringify({ nome: nome.trim(), em_carencias: true }),
        });
      }
      fecharModal();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  async function confirmarRemocao() {
    if (!pendingRemove) return;
    setDeleting(true);
    try {
      await api(`/escolas/${pendingRemove.id}/carencias`, {
        method: "PATCH",
        body: JSON.stringify({ ativa: false }),
      });
      setPendingRemove(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover");
      setPendingRemove(null);
    } finally {
      setDeleting(false);
    }
  }

  async function onImportFile(file: File | null) {
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const itens = parseCarenciasPlanilha(buffer);
      const result = await api<ImportResult>("/carencias/import", {
        method: "POST",
        body: JSON.stringify({ itens }),
      });
      setImportResult(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar Excel");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <PageHeader
        title="Carências"
        description="Só aparecem aqui as escolas que você adicionar. Dá para importar a planilha de carências (grade por escola/turno) ou incluir uma a uma."
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => void onImportFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className={btnSecondary}
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              {importing ? "Importando..." : "Importar Excel"}
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => void abrirModal()}
            >
              Adicionar escola
            </button>
          </>
        }
      />
      <ErrorBanner message={error} />

      {escolas.length === 0 ? (
        <EmptyState message="Nenhuma escola na lista de carências. Adicione uma para começar." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {escolas.map((e) => (
            <Panel key={e.id} className="flex flex-col gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-brand-dark">
                  {e.nome}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {e.quadros ?? 0} quadro(s) · {e.abertos ?? 0} tempo(s) em aberto
                </p>
                {(e.por_disciplina?.length ?? 0) > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {e.por_disciplina!.map((d) => (
                      <li
                        key={`${d.codigo}-${d.nome}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/70 px-2 py-1 text-xs"
                        title={d.nome}
                      >
                        <span className="font-semibold text-brand">
                          {d.codigo !== "—" ? d.codigo : d.nome}
                        </span>
                        <span className="tabular-nums text-muted">
                          {d.abertos} tempo{d.abertos === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-2">
                <Link to={`/carencias/${e.id}`} className={btnPrimary}>
                  Ver turmas / quadros
                </Link>
                <IconDeleteButton
                  title="Remover"
                  label={`Remover ${e.nome} das carências`}
                  onClick={() => setPendingRemove(e)}
                />
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        title="Adicionar escola às carências"
        onClose={fecharModal}
      >
        <ErrorBanner message={formError} />
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="inline-flex rounded-lg bg-background p-0.5 ring-1 ring-border">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                modo === "existente"
                  ? "bg-brand text-white"
                  : "text-muted hover:text-foreground"
              }`}
              onClick={() => setModo("existente")}
              disabled={disponiveis.length === 0}
            >
              Do cadastro
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                modo === "nova"
                  ? "bg-brand text-white"
                  : "text-muted hover:text-foreground"
              }`}
              onClick={() => setModo("nova")}
            >
              Criar nova
            </button>
          </div>

          {modo === "existente" ? (
            <Field label="Escola">
              <select
                className={inputClass}
                required
                autoFocus
                value={escolaId}
                onChange={(e) => setEscolaId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {disponiveis.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Nome">
              <input
                className={inputClass}
                required
                autoFocus
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </Field>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className={btnSecondary}
              onClick={fecharModal}
              disabled={loading}
            >
              Cancelar
            </button>
            <button className={btnPrimary} disabled={loading}>
              {loading ? "Salvando..." : "Adicionar"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!pendingRemove}
        title="Remover da carência"
        message={
          pendingRemove
            ? `Remover "${pendingRemove.nome}" das carências? Todos os quadros e horários dessa escola serão apagados. A escola continua no cadastro.`
            : ""
        }
        confirmLabel="Remover"
        loading={deleting}
        onConfirm={() => void confirmarRemocao()}
        onClose={() => {
          if (!deleting) setPendingRemove(null);
        }}
      />

      <Modal
        open={!!importResult}
        title="Importação de carências"
        onClose={() => setImportResult(null)}
      >
        {importResult ? (
          <div className="space-y-3 text-sm">
            <ul className="space-y-1 text-muted">
              <li>
                <span className="font-medium text-ok">
                  {importResult.escolas_criadas}
                </span>{" "}
                escola(s) criada(s)
              </li>
              <li>
                <span className="font-medium text-foreground">
                  {importResult.escolas_ativadas}
                </span>{" "}
                escola(s) ativada(s) em carências
              </li>
              <li>
                <span className="font-medium text-ok">
                  {importResult.quadros_criados}
                </span>{" "}
                quadro(s) criado(s)
              </li>
              <li>
                <span className="font-medium text-ok">
                  {importResult.slots_criados}
                </span>{" "}
                tempo(s) aberto(s)
              </li>
              <li>
                <span className="font-medium text-foreground">
                  {importResult.slots_existentes}
                </span>{" "}
                tempo(s) já existentes (mantidos)
              </li>
              {importResult.ignorados > 0 ? (
                <li>
                  <span className="font-medium text-foreground">
                    {importResult.ignorados}
                  </span>{" "}
                  linha(s) ignorada(s)
                </li>
              ) : null}
            </ul>
            {importResult.erros.length > 0 ? (
              <div className="max-h-40 overflow-auto rounded-md border border-border bg-background p-2 text-xs text-muted">
                {importResult.erros.slice(0, 20).map((e) => (
                  <p key={e}>{e}</p>
                ))}
                {importResult.erros.length > 20 ? (
                  <p>… e mais {importResult.erros.length - 20}</p>
                ) : null}
              </div>
            ) : null}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                className={btnPrimary}
                onClick={() => setImportResult(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
