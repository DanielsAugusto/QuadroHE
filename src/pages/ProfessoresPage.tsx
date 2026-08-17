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
  btnDanger,
  inputClass,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Paginated, Professor } from "@/lib/types";

const emptyForm = { matricula: "", nome: "", cargo: "", funcao: "" };
const PAGE_SIZE = 20;

type ImportResult = {
  criados: number;
  atualizados: number;
  lotacoes?: number;
  ignorados: number;
  erros: string[];
};

import { decodeSpreadsheetText, repairMojibakeText } from "@/lib/textEncoding";

function detectCsvDelimiter(sample: string): string {
  const first = (sample.split(/\r?\n/).find((l) => l.trim()) ?? "").slice(
    0,
    500,
  );
  const semis = (first.match(/;/g) ?? []).length;
  const commas = (first.match(/,/g) ?? []).length;
  return semis >= commas ? ";" : ",";
}

function looksLikeCsv(buffer: ArrayBuffer, fileName?: string): boolean {
  if (fileName?.toLowerCase().endsWith(".csv")) return true;
  const head = decodeSpreadsheetText(buffer.slice(0, 200));
  return (
    head.includes(";") &&
    /matricula|nome/i.test(head) &&
    !head.includes("PK\u0003\u0004")
  );
}

function readProfessoresWorkbook(buffer: ArrayBuffer, fileName?: string) {
  if (looksLikeCsv(buffer, fileName)) {
    const text = decodeSpreadsheetText(buffer);
    const FS = detectCsvDelimiter(text);
    return XLSX.read(text, { type: "string", FS, cellDates: true });
  }
  return XLSX.read(buffer, { type: "array", cellDates: true });
}

function normalizeHeader(value: string) {
  let n = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\uFFFD/g, "")
    .trim()
    .toUpperCase()
    .replace(/º|°/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  // CSV com encoding quebrado: "Matrícula" → MATRI_CULA / MATRCULA
  if (/^MATR[I_]*CULA$/.test(n) || n === "MATRCULA") return "MATRICULA";
  if (/^OBSERV/.test(n)) return "OBSERVACAO";
  return n;
}

function cellRaw(
  row: Record<string, unknown>,
  aliases: string[],
): unknown {
  for (const key of aliases) {
    if (!(key in row)) continue;
    const raw = row[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "string" && !raw.trim()) continue;
    return raw;
  }
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const hit = keys.find(
      (k) =>
        k === alias ||
        k.startsWith(`${alias}_`) ||
        (alias.length >= 4 && k.includes(alias)),
    );
    if (!hit) continue;
    const raw = row[hit];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "string" && !raw.trim()) continue;
    return raw;
  }
  return undefined;
}

function cellStr(row: Record<string, unknown>, aliases: string[]) {
  const raw = cellRaw(row, aliases);
  if (raw === undefined || raw === null) return "";
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (Number.isInteger(raw) || Math.abs(raw - Math.round(raw)) < 1e-9) {
      return String(Math.round(raw));
    }
    return String(raw);
  }
  return repairMojibakeText(String(raw).trim()) ?? "";
}

function findHeaderRowIndex(sheet: XLSX.WorkSheet): number {
  const rows = XLSX.utils.sheet_to_json<Array<string | number | null>>(
    sheet,
    { header: 1, defval: "", raw: false },
  ) as Array<Array<string | number | null>>;

  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = (rows[i] ?? []).map((c) => normalizeHeader(String(c ?? "")));
    const hasMat =
      cells.includes("MATRICULA") ||
      cells.includes("MAT") ||
      cells.includes("CGM");
    const hasNome = cells.some(
      (c) => c === "NOME" || c.startsWith("NOME_") || c.includes("FUNCIONARIO"),
    );
    if (hasMat && hasNome) return i;
    if (hasMat && cells.some((c) => c === "CARGO" || c.startsWith("FUNCAO"))) {
      return i;
    }
  }
  return 0;
}

function extrasValue(value: unknown): string | number | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Number.isInteger(value) || Math.abs(value - Math.round(value)) < 1e-9) {
      return Math.round(value);
    }
    return value;
  }
  const text = String(value).trim();
  return text || null;
}

function parseDateField(value: unknown): string | null {
  const v = extrasValue(value);
  if (v === null) return null;
  if (typeof v === "number") {
    // Excel serial date
    const utc = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000;
    return new Date(utc).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  return s || null;
}

function parseSheetProfessores(sheet: XLSX.WorkSheet) {
  const headerRow = findHeaderRowIndex(sheet);
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
    range: headerRow,
  });

  return rawRows.map((row) => {
    const mapped: Record<string, unknown> = {};
    const extras: Record<string, string | number> = {};

    for (const [key, value] of Object.entries(row)) {
      const label = String(key).trim();
      if (!label || label.startsWith("__")) continue;
      const norm = normalizeHeader(label);
      if (!norm || norm.startsWith("EMPTY")) continue;

      const serialized = extrasValue(value);
      if (serialized !== null) {
        const key = repairMojibakeText(label) ?? label;
        extras[key] =
          typeof serialized === "string"
            ? (repairMojibakeText(serialized) ?? serialized)
            : serialized;
      }

      if (
        mapped[norm] !== undefined &&
        mapped[norm] !== null &&
        String(mapped[norm]).trim() !== ""
      ) {
        continue;
      }
      mapped[norm] = value;
    }

    return {
      matricula: cellStr(mapped, ["MATRICULA", "MAT", "MATRIC"]),
      cgm: cellStr(mapped, ["CGM"]) || null,
      dt_admiss: parseDateField(
        cellRaw(mapped, [
          "DT_ADMISS",
          "DT_ADMISSAO",
          "DATA_ADMISSAO",
        ]),
      ),
      nome: cellStr(mapped, [
        "NOME",
        "NOME_DO_U",
        "NOME_DO_USUARIO",
        "NOME_DO_SERVIDOR",
        "FUNCIONARIO",
        "PROFESSOR",
      ]),
      cod_cargo: cellStr(mapped, ["COD_CARGO", "CODIGO_CARGO"]) || null,
      cargo: cellStr(mapped, ["CARGO"]) || null,
      dt_inicio: parseDateField(
        cellRaw(mapped, [
          "DT_INICIO",
          "DT_INICIO_",
          "DT_INICIO_FUNCAO",
          "DATA_INICIO",
          "DATA_INICIO_FUNCAO",
        ]),
      ),
      funcao:
        cellStr(mapped, [
          "FUNCAO",
          "FUNCAO_NA",
          "FUNCAO_NA_ESCOLA",
          "FUNCAO_DO_SERVIDOR",
        ]) || null,
      rescisao:
        cellStr(mapped, ["RESCISAO", "DT_RESCISAO", "DATA_RESCISAO"]) || null,
      escola: cellStr(mapped, ["ESCOLA", "UNIDADE", "LOTACAO_ESCOLA"]) || null,
      tipohora: cellStr(mapped, ["TIPOHORA", "TIPO_HORA", "TIPO_DE_HORA"]) || null,
      cod_lotacao: cellStr(mapped, ["COD_LOTAC", "COD_LOTACAO", "CODIGO_LOTACAO"]) || null,
      lotacao: cellStr(mapped, ["LOTACAO", "LOTACAO_ORIGEM"]) || null,
      padrao: cellStr(mapped, ["PADRAO"]) || null,
      observacao: cellStr(mapped, ["OBSERVACAO", "OBS", "OBSERVACOES"]) || null,
      raca: cellStr(mapped, ["RACA"]) || null,
      sexo: cellStr(mapped, ["SEXO"]) || null,
      extras,
      _headers: Object.keys(mapped),
    };
  });
}

function parseProfessoresExcel(buffer: ArrayBuffer, fileName?: string) {
  const wb = readProfessoresWorkbook(buffer, fileName);
  if (!wb.SheetNames.length) throw new Error("Planilha vazia");

  let best: ReturnType<typeof parseSheetProfessores> = [];
  let bestHeaders: string[] = [];

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const rows = parseSheetProfessores(sheet);
    const valid = rows.filter((r) => r.matricula && r.nome);
    if (valid.length > best.filter((r) => r.matricula && r.nome).length) {
      best = rows;
      bestHeaders = rows[0]?._headers ?? [];
    }
  }

  const itens = best
    .filter((r) => r.matricula || r.nome)
    .map(
      ({
        matricula,
        nome,
        cargo,
        funcao,
        cgm,
        dt_admiss,
        cod_cargo,
        dt_inicio,
        rescisao,
        escola,
        tipohora,
        cod_lotacao,
        lotacao,
        padrao,
        observacao,
        raca,
        sexo,
        extras,
      }) => ({
        matricula,
        nome,
        cargo,
        funcao,
        cgm,
        dt_admiss,
        cod_cargo,
        dt_inicio,
        rescisao,
        escola,
        tipohora,
        cod_lotacao,
        lotacao,
        padrao,
        observacao,
        raca,
        sexo,
        extras: Object.keys(extras).length > 0 ? extras : null,
      }),
    );

  if (itens.length === 0) {
    const dica =
      bestHeaders.length > 0
        ? ` Colunas encontradas: ${bestHeaders.slice(0, 12).join(", ")}.`
        : " Não foi possível ler o cabeçalho.";
    throw new Error(
      `Nenhum professor com matrícula e nome encontrado na planilha.${dica}`,
    );
  }

  return itens;
}

export function ProfessoresPage({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const { isAdmin } = useAuth();
  const [itens, setItens] = useState<Professor[]>([]);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Professor | null>(null);
  const [pendingDeleteAll, setPendingDeleteAll] = useState(false);
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

  async function confirmarExclusaoTudo() {
    setDeleting(true);
    try {
      await api<{ deleted: number }>("/professores", { method: "DELETE" });
      setPendingDeleteAll(false);
      setPage(1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir tudo");
      setPendingDeleteAll(false);
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
      const itensImport = parseProfessoresExcel(buffer, file.name);
      if (itensImport.length === 0) {
        throw new Error("Nenhum registro válido para importar");
      }
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
            className={btnDanger}
            disabled={importing || deleting || (total === 0 && !busca.trim())}
            onClick={() => setPendingDeleteAll(true)}
          >
            Apagar tudo
          </button>
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
      <button type="button" className={btnPrimary} onClick={abrirNovo}>
        Novo professor
      </button>
    </>
  );

  return (
    <div>
      {embedded ? (
        <div className="mb-4 flex flex-wrap justify-end gap-2">{actions}</div>
      ) : (
        <PageHeader
          title="Professores"
          description="Cadastro pela matrícula — chave que liga Hora Extra e alocações."
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
                          state={{ from: "/configuracao?tab=professores" }}
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
                          {isAdmin ? (
                            <IconDeleteButton
                              label={`Excluir ${p.nome}`}
                              onClick={() => setPendingDelete(p)}
                            />
                          ) : null}
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
              professor(es) criado(s)
            </p>
            <p>
              <span className="font-medium text-brand">
                {importResult.atualizados}
              </span>{" "}
              professor(es) atualizado(s)
            </p>
            {typeof importResult.lotacoes === "number" ? (
              <p>
                <span className="font-medium text-brand">
                  {importResult.lotacoes}
                </span>{" "}
                lotação(ões) gravada(s) (NORMAL + hora extra)
              </p>
            ) : null}
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

      <ConfirmDialog
        open={pendingDeleteAll}
        title="Apagar todos os professores"
        message="Isso vai excluir permanentemente TODOS os professores e também lotações, horas extras e alocações vinculadas às matrículas. Esta ação não pode ser desfeita."
        confirmLabel="Apagar tudo"
        loading={deleting}
        onConfirm={() => void confirmarExclusaoTudo()}
        onClose={() => {
          if (!deleting) setPendingDeleteAll(false);
        }}
      />
    </div>
  );
}
