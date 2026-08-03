import { FormEvent, useCallback, useEffect, useState } from "react";
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
import type { Escola } from "@/lib/types";

type Resumo = Escola & { quadros?: number; abertos?: number };
type ModoAdd = "existente" | "nova";

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

  return (
    <div>
      <PageHeader
        title="Carências"
        description="Só aparecem aqui as escolas que você adicionar. Use o botão para incluir uma do cadastro ou criar nova."
        actions={
          <button type="button" className={btnPrimary} onClick={() => void abrirModal()}>
            Adicionar escola
          </button>
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
    </div>
  );
}
