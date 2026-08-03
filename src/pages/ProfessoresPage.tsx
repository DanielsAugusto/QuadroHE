import {
  FormEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
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
import type { Paginated, Professor } from "@/lib/types";

const emptyForm = { matricula: "", nome: "", cargo: "", funcao: "" };
const PAGE_SIZE = 20;

type ImportResult = {
  criados: number;
  atualizados: number;
  ignorados: number;
  erros: string[];
};

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function cellStr(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const raw = row[key];
    if (raw === undefined || raw === null) continue;
    const text = String(raw).trim();
    if (text) return text;
  }
  return "";
}

function parseProfessoresExcel(buffer: ArrayBuffer) {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("Planilha vazia");

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  if (rawRows.length === 0) {
    throw new Error("Nenhuma linha encontrada na planilha");
  }

  return rawRows.map((row) => {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      mapped[normalizeHeader(key)] = value;
    }
    return {
      matricula: cellStr(mapped, ["MATRICULA", "MAT"]),
      nome: cellStr(mapped, ["NOME"]),
      cargo: cellStr(mapped, ["CARGO"]) || null,
      funcao: cellStr(mapped, ["FUNCAO", "FUNÇÃO"]) || null,
    };
  });
}

export function ProfessoresPage() {
  const [itens, setItens] = useState<Professor[]>([]);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Professor | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const buscaDeferred = useDeferredValue(busca);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (buscaDeferred.trim()) params.set("q", buscaDeferred.trim());
      const data = await api<Paginated<Professor>>(
        `/professores?${params.toString()}`,
      );
      setItens(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    }
  }, [page, buscaDeferred]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paginaAtual = itens;

  function abrirNovo() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  }

  function abrirEditar(p: Professor) {
    setEditing(p.matricula);
    setForm({
      matricula: p.matricula,
      nome: p.nome,
      cargo: p.cargo ?? "",
      funcao: p.funcao ?? "",
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
        matricula: form.matricula.trim(),
        nome: form.nome.trim(),
        cargo: form.cargo.trim() || null,
        funcao: form.funcao.trim() || null,
      };
      if (editing) {
        await api(`/professores/${editing}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/professores", {
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
      await api(`/professores/${pendingDelete.matricula}`, { method: "DELETE" });
      setPendingDelete(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir");
      setPendingDelete(null);
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
      const itensImport = parseProfessoresExcel(buffer);
      const result = await api<ImportResult>("/professores/import", {
        method: "POST",
        body: JSON.stringify({ itens: itensImport }),
      });
      setImportResult(result);
      setPage(1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar Excel");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const inicio = total === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1;
  const fim = Math.min(pageSafe * PAGE_SIZE, total);

  return (
    <div>
      <PageHeader
        title="Professores"
        description="Cadastro pela matrícula — chave que liga Hora Extra e alocações."
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
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
            <button type="button" className={btnPrimary} onClick={abrirNovo}>
              Novo professor
            </button>
          </>
        }
      />
      <ErrorBanner message={error} />

      <Panel>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full max-w-md">
            <Field label="Pesquisar">
              <input
                className={inputClass}
                placeholder="Matrícula, nome, cargo ou função..."
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
              ? "Nenhum resultado"
              : `Mostrando ${inicio}–${fim} de ${total}`}
          </p>
        </div>

        {total === 0 ? (
          <EmptyState
            message={
              busca.trim()
                ? "Nenhum professor encontrado para essa pesquisa."
                : "Nenhum professor cadastrado."
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border text-muted">
                  <tr>
                    <th className="px-2 py-2 font-medium">Matrícula</th>
                    <th className="px-2 py-2 font-medium">Nome</th>
                    <th className="px-2 py-2 font-medium">Cargo</th>
                    <th className="px-2 py-2 font-medium">Função</th>
                    <th className="px-2 py-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginaAtual.map((p) => (
                    <tr key={p.matricula} className="border-b border-border/70">
                      <td className="px-2 py-2">
                        <Link
                          to={`/professores/${p.matricula}`}
                          className="text-brand underline-offset-2 hover:underline"
                        >
                          {p.matricula}
                        </Link>
                      </td>
                      <td className="px-2 py-2">{p.nome}</td>
                      <td className="px-2 py-2">{p.cargo ?? "—"}</td>
                      <td className="px-2 py-2">{p.funcao ?? "—"}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <IconEditButton
                            label={`Editar ${p.nome}`}
                            onClick={() => abrirEditar(p)}
                          />
                          <IconDeleteButton
                            label={`Excluir ${p.nome}`}
                            onClick={() => setPendingDelete(p)}
                          />
                        </div>
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
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Próxima
                </button>
              </div>
            </div>
          </>
        )}
      </Panel>

      <Modal
        open={modalOpen}
        title={editing ? "Editar professor" : "Novo professor"}
        onClose={fecharModal}
      >
        <ErrorBanner message={formError} />
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Matrícula">
            <input
              className={inputClass}
              required
              autoFocus
              disabled={!!editing}
              value={form.matricula}
              onChange={(e) =>
                setForm((f) => ({ ...f, matricula: e.target.value }))
              }
            />
          </Field>
          <Field label="Nome">
            <input
              className={inputClass}
              required
              value={form.nome}
              onChange={(e) =>
                setForm((f) => ({ ...f, nome: e.target.value }))
              }
            />
          </Field>
          <Field label="Cargo">
            <input
              className={inputClass}
              value={form.cargo}
              onChange={(e) =>
                setForm((f) => ({ ...f, cargo: e.target.value }))
              }
            />
          </Field>
          <Field label="Função">
            <input
              className={inputClass}
              value={form.funcao}
              onChange={(e) =>
                setForm((f) => ({ ...f, funcao: e.target.value }))
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

      <Modal
        open={!!importResult}
        title="Importação concluída"
        onClose={() => setImportResult(null)}
      >
        {importResult ? (
          <div className="space-y-3 text-sm">
            <p>
              <span className="font-medium text-ok">{importResult.criados}</span>{" "}
              criado(s)
            </p>
            <p>
              <span className="font-medium text-brand">
                {importResult.atualizados}
              </span>{" "}
              atualizado(s)
            </p>
            <p>
              <span className="font-medium text-muted">
                {importResult.ignorados}
              </span>{" "}
              ignorado(s)
            </p>
            {importResult.erros.length > 0 ? (
              <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-background p-2 text-xs text-muted">
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

      <ConfirmDialog
        open={!!pendingDelete}
        message={
          pendingDelete
            ? `Excluir o professor ${pendingDelete.nome} (${pendingDelete.matricula})? Esta ação não pode ser desfeita.`
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
