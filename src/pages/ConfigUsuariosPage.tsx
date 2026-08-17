import { FormEvent, useCallback, useEffect, useState } from "react";
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
import { useAuth, type PapelUsuario } from "@/lib/auth";

type Usuario = {
  id: string;
  email: string;
  nome: string;
  papel: PapelUsuario;
  ativo: boolean;
  created_at: string;
  updated_at?: string | null;
};

const PAPEL_LABEL: Record<PapelUsuario, string> = {
  admin: "Administrador",
  operador: "Operador",
};

const emptyForm = {
  nome: "",
  email: "",
  password: "",
  papel: "operador" as PapelUsuario,
};

export function ConfigUsuariosPage() {
  const { user: me } = useAuth();
  const [itens, setItens] = useState<Usuario[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingInativar, setPendingInativar] = useState<Usuario | null>(null);
  const [pendingReativar, setPendingReativar] = useState<Usuario | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Usuario | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<Usuario[]>("/usuarios");
      setItens(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function abrirNovo() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setModalAberto(true);
  }

  function abrirEditar(u: Usuario) {
    setEditing(u);
    setForm({
      nome: u.nome,
      email: u.email,
      password: "",
      papel: u.papel,
    });
    setFormError(null);
    setModalAberto(true);
  }

  function fecharModal() {
    if (saving) return;
    setModalAberto(false);
    setEditing(null);
    setFormError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const nome = form.nome.trim();
    const email = form.email.trim().toLowerCase();
    const password = form.password;

    if (!nome || !email) {
      setFormError("Informe nome e e-mail.");
      return;
    }
    if (!editing && password.length < 8) {
      setFormError("Senha deve ter ao menos 8 caracteres.");
      return;
    }
    if (editing && password && password.length < 8) {
      setFormError("Nova senha deve ter ao menos 8 caracteres.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await api(`/usuarios/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({
            nome,
            email,
            papel: form.papel,
            ...(password ? { password } : {}),
          }),
        });
      } else {
        await api("/usuarios", {
          method: "POST",
          body: JSON.stringify({
            nome,
            email,
            password,
            papel: form.papel,
          }),
        });
      }
      setModalAberto(false);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function confirmarInativar() {
    if (!pendingInativar) return;
    setSaving(true);
    try {
      await api(`/usuarios/${pendingInativar.id}/inativar`, { method: "POST" });
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
      await api(`/usuarios/${pendingReativar.id}/reativar`, { method: "POST" });
      setPendingReativar(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao reativar");
      setPendingReativar(null);
    } finally {
      setSaving(false);
    }
  }

  async function confirmarExcluir() {
    if (!pendingDelete) return;
    setSaving(true);
    try {
      await api(`/usuarios/${pendingDelete.id}`, { method: "DELETE" });
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
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-brand-dark">
              Usuários
            </h2>
            <p className="mt-1 text-sm text-muted">
              Cadastre logins da equipe. Administradores gerenciam usuários;
              operadores usam o sistema normalmente.
            </p>
          </div>
          <button type="button" className={btnPrimary} onClick={abrirNovo}>
            Novo usuário
          </button>
        </div>

        {itens.length === 0 ? (
          <EmptyState message="Nenhum usuário cadastrado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="px-2 py-2 font-medium">Situação</th>
                  <th className="px-2 py-2 font-medium">Nome</th>
                  <th className="px-2 py-2 font-medium">E-mail</th>
                  <th className="px-2 py-2 font-medium">Papel</th>
                  <th className="px-2 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((u) => {
                  const souEu = me?.id === u.id;
                  return (
                    <tr
                      key={u.id}
                      className={`border-b border-border/70 ${
                        u.ativo ? "" : "bg-amber-50/70"
                      }`}
                    >
                      <td className="px-2 py-2 whitespace-nowrap">
                        {u.ativo ? (
                          <span className="inline-flex rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                            Ativo
                          </span>
                        ) : (
                          <span className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
                            Inativo
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {u.nome}
                        {souEu ? (
                          <span className="ml-1.5 text-xs text-muted">(você)</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">{u.email}</td>
                      <td className="px-2 py-2">{PAPEL_LABEL[u.papel]}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="rounded-md px-2 py-1 text-xs font-medium text-brand transition hover:bg-brand-soft"
                            onClick={() => abrirEditar(u)}
                          >
                            Editar
                          </button>
                          {u.ativo ? (
                            <IconCloseButton
                              label={`Inativar ${u.nome}`}
                              title="Inativar"
                              disabled={souEu}
                              onClick={() => setPendingInativar(u)}
                            />
                          ) : (
                            <>
                              <IconCheckButton
                                label={`Reativar ${u.nome}`}
                                title="Reativar"
                                onClick={() => setPendingReativar(u)}
                              />
                              <IconDeleteButton
                                label={`Excluir ${u.nome}`}
                                title="Excluir permanentemente"
                                disabled={souEu}
                                onClick={() => setPendingDelete(u)}
                              />
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
        )}
      </Panel>

      <Modal
        open={modalAberto}
        title={editing ? "Editar usuário" : "Novo usuário"}
        onClose={fecharModal}
      >
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <ErrorBanner message={formError} />
          <Field label="Nome">
            <input
              className={inputClass}
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              required
            />
          </Field>
          <Field label="E-mail">
            <input
              className={inputClass}
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </Field>
          <Field label={editing ? "Nova senha (opcional)" : "Senha"}>
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) =>
                setForm((f) => ({ ...f, password: e.target.value }))
              }
              required={!editing}
              minLength={editing ? undefined : 6}
              placeholder={editing ? "Deixe em branco para manter" : undefined}
            />
          </Field>
          <Field label="Papel">
            <select
              className={inputClass}
              value={form.papel}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  papel: e.target.value as PapelUsuario,
                }))
              }
            >
              <option value="operador">Operador</option>
              <option value="admin">Administrador</option>
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className={btnSecondary}
              disabled={saving}
              onClick={fecharModal}
            >
              Cancelar
            </button>
            <button className={btnPrimary} disabled={saving}>
              {saving
                ? "Salvando…"
                : editing
                  ? "Salvar"
                  : "Criar usuário"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!pendingInativar}
        title="Inativar usuário"
        message={
          pendingInativar
            ? `Inativar ${pendingInativar.nome} (${pendingInativar.email})? A pessoa não conseguirá entrar até ser reativada.`
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
        title="Reativar usuário"
        message={
          pendingReativar
            ? `Reativar ${pendingReativar.nome} (${pendingReativar.email})?`
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
        title="Excluir usuário"
        message={
          pendingDelete
            ? `Excluir permanentemente ${pendingDelete.nome} (${pendingDelete.email})? Esta ação não pode ser desfeita.`
            : ""
        }
        confirmLabel="Excluir"
        loading={saving}
        onConfirm={() => void confirmarExcluir()}
        onClose={() => {
          if (!saving) setPendingDelete(null);
        }}
      />
    </div>
  );
}
