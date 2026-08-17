import {
  FormEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
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
import { useAuth } from "@/lib/auth";
import type { Escola, Paginated } from "@/lib/types";

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

function parseEscolasExcel(buffer: ArrayBuffer) {
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
      nome: cellStr(mapped, ["ESCOLAS", "ESCOLA", "NOME"]),
    };
  });
}

export function EscolasPage({ embedded = false }: { embedded?: boolean }) {
  const { isAdmin } = useAuth();
  const [itens, setItens] = useState<Escola[]>([]);
  const [total, setTotal] = useState(0);
  const [nome, setNome] = useState("");
  const [editing, setEditing] = useState<Escola | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Escola | null>(null);
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
      const data = await api<Paginated<Escola>>(`/escolas?${params.toString()}`);
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

  const inicio = total === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1;
  const fim = Math.min(pageSafe * PAGE_SIZE, total);

  function abrirNova() {
    setEditing(null);
    setNome("");
    setFormError(null);
    setModalOpen(true);
  }

  function abrirEditar(e: Escola) {
    setEditing(e);
    setNome(e.nome);
    setFormError(null);
    setModalOpen(true);
  }

  function fecharModal() {
    setModalOpen(false);
    setEditing(null);
    setNome("");
    setFormError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFormError(null);
    try {
      if (editing) {
        await api(`/escolas/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({ nome: nome.trim() }),
        });
      } else {
        await api("/escolas", {
          method: "POST",
          body: JSON.stringify({ nome: nome.trim() }),
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
      await api(`/escolas/${pendingDelete.id}`, { method: "DELETE" });
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
      const itensImport = parseEscolasExcel(buffer);
      const result = await api<ImportResult>("/escolas/import", {
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

  const actions = (
    <>
      {isAdmin ? (
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
        </>
      ) : null}
      <button type="button" className={btnPrimary} onClick={abrirNova}>
        Nova escola
      </button>
    </>
  );

  return (
    <div>
      {embedded ? (
        <div className="mb-4 flex flex-wrap justify-end gap-2">{actions}</div>
      ) : (
        <PageHeader
          title="Escolas"
          description="Cadastro das unidades onde os tempos são alocados."
          actions={actions}
        />
      )}
      <ErrorBanner message={error} />

      <Panel>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full max-w-md">
            <Field label="Pesquisar">
              <input
                className={inputClass}
                placeholder="Nome da escola..."
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
                ? "Nenhuma escola encontrada para essa pesquisa."
                : "Nenhuma escola cadastrada."
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {paginaAtual.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <span className="text-sm font-medium">{e.nome}</span>
                  <div className="flex items-center gap-1">
                    <IconEditButton
                      label={`Editar ${e.nome}`}
                      onClick={() => abrirEditar(e)}
                    />
                    {isAdmin ? (
                      <IconDeleteButton
                        label={`Excluir ${e.nome}`}
                        onClick={() => setPendingDelete(e)}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

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
        title={editing ? "Editar escola" : "Nova escola"}
        onClose={fecharModal}
      >
        <ErrorBanner message={formError} />
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Nome">
            <input
              className={inputClass}
              required
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
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
              criada(s)
            </p>
            <p>
              <span className="font-medium text-muted">
                {importResult.ignorados}
              </span>{" "}
              ignorada(s) (já existiam ou vazias)
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
            ? `Excluir a escola "${pendingDelete.nome}"? Todos os quadros e carências dela serão removidos.`
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
