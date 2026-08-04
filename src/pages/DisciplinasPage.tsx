import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  IconDeleteButton,
  IconEditButton,
  Modal,
  PageHeader,
  Panel,
  btnPrimary,
  btnSecondary,
  inputClass,
} from "@/components/ui";
import { api } from "@/lib/api";
import type { Disciplina } from "@/lib/types";

const emptyForm = { nome: "", codigo: "" };

export function DisciplinasPage({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const [itens, setItens] = useState<Disciplina[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Disciplina | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Disciplina | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setItens(await api<Disciplina[]>("/disciplinas"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function abrirNova() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  }

  function abrirEditar(d: Disciplina) {
    setEditing(d);
    setForm({ nome: d.nome, codigo: d.codigo });
    setFormError(null);
    setModalOpen(true);
  }

  function fecharModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFormError(null);
    try {
      const payload = {
        nome: form.nome.trim(),
        codigo: form.codigo.trim().toUpperCase(),
      };
      if (editing) {
        await api(`/disciplinas/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/disciplinas", {
          method: "POST",
          body: JSON.stringify(payload),
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

  async function confirmarExclusao() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api(`/disciplinas/${pendingDelete.id}`, { method: "DELETE" });
      setPendingDelete(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir");
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const actions = (
    <button type="button" className={btnPrimary} onClick={abrirNova}>
      Nova disciplina
    </button>
  );

  return (
    <div>
      {embedded ? (
        <div className="mb-4 flex flex-wrap justify-end gap-2">{actions}</div>
      ) : (
        <PageHeader
          title="Disciplinas"
          description="Componentes curriculares usados na HE e nas alocações."
          actions={actions}
        />
      )}
      <ErrorBanner message={error} />

      <Panel>
        {itens.length === 0 ? (
          <EmptyState message="Nenhuma disciplina cadastrada." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="px-2 py-2 font-medium">Código</th>
                  <th className="px-2 py-2 font-medium">Nome</th>
                  <th className="px-2 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((d) => (
                  <tr key={d.id} className="border-b border-border/70">
                    <td className="px-2 py-2 font-medium">{d.codigo}</td>
                    <td className="px-2 py-2">{d.nome}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <IconEditButton
                          label={`Editar ${d.nome}`}
                          onClick={() => abrirEditar(d)}
                        />
                        <IconDeleteButton
                          label={`Excluir ${d.nome}`}
                          onClick={() => setPendingDelete(d)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={modalOpen}
        title={editing ? "Editar disciplina" : "Nova disciplina"}
        onClose={fecharModal}
      >
        <ErrorBanner message={formError} />
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Nome">
            <input
              className={inputClass}
              required
              autoFocus
              value={form.nome}
              onChange={(e) =>
                setForm((f) => ({ ...f, nome: e.target.value }))
              }
            />
          </Field>
          <Field label="Código">
            <input
              className={inputClass}
              required
              value={form.codigo}
              onChange={(e) =>
                setForm((f) => ({ ...f, codigo: e.target.value }))
              }
            />
          </Field>
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
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        message={
          pendingDelete
            ? `Excluir a disciplina ${pendingDelete.codigo} — ${pendingDelete.nome}?`
            : ""
        }
        loading={deleting}
        onConfirm={() => void confirmarExclusao()}
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
      />
    </div>
  );
}
