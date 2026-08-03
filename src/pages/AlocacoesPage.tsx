import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import {
  TURNO_LABEL,
  type Alocacao,
  type Disciplina,
  type Escola,
  type Professor,
  type StatusAlocacao,
  type Turno,
} from "@/lib/types";

const emptyForm = {
  matricula: "",
  escola_id: "",
  disciplina_id: "",
  turno: "MANHA" as Turno,
  tempos: "5",
  turma_codigo: "",
  status: "ATIVA" as StatusAlocacao,
};

export function AlocacoesPage() {
  const [itens, setItens] = useState<Alocacao[]>([]);
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [escolas, setEscolas] = useState<Escola[]>([]);
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [filtroEscola, setFiltroEscola] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Alocacao | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [alocs, profs, escs, discs] = await Promise.all([
        api<Alocacao[]>("/alocacoes"),
        api<Professor[]>("/professores"),
        api<Escola[]>("/escolas"),
        api<Disciplina[]>("/disciplinas"),
      ]);
      setItens(alocs);
      setProfessores(profs);
      setEscolas(escs);
      setDisciplinas(discs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtrados = useMemo(
    () =>
      filtroEscola ? itens.filter((a) => a.escola_id === filtroEscola) : itens,
    [itens, filtroEscola],
  );

  const resumoPorEscola = useMemo(() => {
    const map = new Map<
      string,
      { nome: string; manha: number; tarde: number; noite: number; total: number }
    >();
    for (const a of itens.filter((x) => x.status === "ATIVA")) {
      const nome = a.escola_nome ?? a.escola_id;
      const cur = map.get(a.escola_id) ?? {
        nome,
        manha: 0,
        tarde: 0,
        noite: 0,
        total: 0,
      };
      if (a.turno === "MANHA") cur.manha += a.tempos;
      if (a.turno === "TARDE") cur.tarde += a.tempos;
      if (a.turno === "NOITE") cur.noite += a.tempos;
      cur.total += a.tempos;
      map.set(a.escola_id, cur);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR"),
    );
  }, [itens]);

  function abrirNova() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  }

  function abrirEditar(a: Alocacao) {
    setEditing(a.id);
    setForm({
      matricula: a.matricula,
      escola_id: a.escola_id,
      disciplina_id: a.disciplina_id ?? "",
      turno: a.turno,
      tempos: String(a.tempos),
      turma_codigo: a.turma_codigo ?? "",
      status: a.status,
    });
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
        matricula: form.matricula,
        escola_id: form.escola_id,
        disciplina_id: form.disciplina_id || null,
        turno: form.turno,
        tempos: Number(form.tempos),
        turma_codigo: form.turma_codigo.trim() || null,
        status: form.status,
      };
      if (editing) {
        await api(`/alocacoes/${editing}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/alocacoes", {
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
      await api(`/alocacoes/${pendingDelete.id}`, { method: "DELETE" });
      setPendingDelete(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir");
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Quadro / Alocações"
        description="Informe em qual escola o professor vai pegar tempos, por turno e turma."
        actions={
          <button type="button" className={btnPrimary} onClick={abrirNova}>
            Nova alocação
          </button>
        }
      />
      <ErrorBanner message={error} />

      {resumoPorEscola.length > 0 ? (
        <Panel className="mb-6">
          <h2 className="mb-3 font-display text-lg font-semibold text-brand-dark">
            Resumo por escola (alocações ativas)
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="px-2 py-2 font-medium">Escola</th>
                  <th className="px-2 py-2 font-medium">Manhã</th>
                  <th className="px-2 py-2 font-medium">Tarde</th>
                  <th className="px-2 py-2 font-medium">Noite</th>
                  <th className="px-2 py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {resumoPorEscola.map((r) => (
                  <tr key={r.nome} className="border-b border-border/70">
                    <td className="px-2 py-2">{r.nome}</td>
                    <td className="px-2 py-2">{r.manha}</td>
                    <td className="px-2 py-2">{r.tarde}</td>
                    <td className="px-2 py-2">{r.noite}</td>
                    <td className="px-2 py-2 font-medium text-brand">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <Panel>
        <div className="mb-4 max-w-sm">
          <Field label="Filtrar por escola">
            <select
              className={inputClass}
              value={filtroEscola}
              onChange={(e) => setFiltroEscola(e.target.value)}
            >
              <option value="">Todas</option>
              {escolas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {filtrados.length === 0 ? (
          <EmptyState message="Nenhuma alocação cadastrada." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="px-2 py-2 font-medium">Professor</th>
                  <th className="px-2 py-2 font-medium">Escola</th>
                  <th className="px-2 py-2 font-medium">Turno</th>
                  <th className="px-2 py-2 font-medium">Tempos</th>
                  <th className="px-2 py-2 font-medium">Turma</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((a) => (
                  <tr key={a.id} className="border-b border-border/70">
                    <td className="px-2 py-2">
                      <Link
                        to={`/professores/${a.matricula}`}
                        className="text-brand underline-offset-2 hover:underline"
                      >
                        {a.professor_nome ?? a.matricula}
                      </Link>
                    </td>
                    <td className="px-2 py-2">{a.escola_nome ?? "—"}</td>
                    <td className="px-2 py-2">{TURNO_LABEL[a.turno]}</td>
                    <td className="px-2 py-2 font-medium">{a.tempos}</td>
                    <td className="px-2 py-2">{a.turma_codigo ?? "—"}</td>
                    <td className="px-2 py-2">{a.status}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <IconEditButton
                          label={`Editar alocação de ${a.professor_nome ?? a.matricula}`}
                          onClick={() => abrirEditar(a)}
                        />
                        <IconDeleteButton
                          label={`Excluir alocação de ${a.professor_nome ?? a.matricula}`}
                          onClick={() => setPendingDelete(a)}
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
        title={editing ? "Editar alocação" : "Nova alocação"}
        onClose={fecharModal}
        wide
      >
        <ErrorBanner message={formError} />
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Professor">
            <select
              className={inputClass}
              required
              autoFocus
              value={form.matricula}
              onChange={(e) =>
                setForm((f) => ({ ...f, matricula: e.target.value }))
              }
            >
              <option value="">Selecione...</option>
              {professores.map((p) => (
                <option key={p.matricula} value={p.matricula}>
                  {p.matricula} — {p.nome}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Escola">
            <select
              className={inputClass}
              required
              value={form.escola_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, escola_id: e.target.value }))
              }
            >
              <option value="">Selecione...</option>
              {escolas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Disciplina">
            <select
              className={inputClass}
              value={form.disciplina_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, disciplina_id: e.target.value }))
              }
            >
              <option value="">Opcional</option>
              {disciplinas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.codigo} — {d.nome}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Turno">
              <select
                className={inputClass}
                value={form.turno}
                onChange={(e) =>
                  setForm((f) => ({ ...f, turno: e.target.value as Turno }))
                }
              >
                <option value="MANHA">Manhã</option>
                <option value="TARDE">Tarde</option>
                <option value="NOITE">Noite</option>
              </select>
            </Field>
            <Field label="Tempos">
              <input
                className={inputClass}
                type="number"
                min={1}
                required
                value={form.tempos}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tempos: e.target.value }))
                }
              />
            </Field>
          </div>
          <Field label="Código da turma">
            <input
              className={inputClass}
              value={form.turma_codigo}
              onChange={(e) =>
                setForm((f) => ({ ...f, turma_codigo: e.target.value }))
              }
            />
          </Field>
          <Field label="Status">
            <select
              className={inputClass}
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  status: e.target.value as StatusAlocacao,
                }))
              }
            >
              <option value="ATIVA">Ativa</option>
              <option value="ENCERRADA">Encerrada</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
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
            ? `Excluir a alocação de ${pendingDelete.professor_nome ?? pendingDelete.matricula} em ${pendingDelete.escola_nome ?? "escola"}?`
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
