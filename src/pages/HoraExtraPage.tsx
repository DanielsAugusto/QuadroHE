import {
  FormEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
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
  IconCloseButton,
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
import { decodeSpreadsheetText } from "@/lib/textEncoding";
import {
  TIPO_HE_LABEL,
  formatDateBR,
  type HoraExtra,
  type Paginated,
  type Professor,
  type TipoHE,
} from "@/lib/types";

const emptyForm = {
  matricula: "",
  nome: "",
  cargo: "",
  funcao: "",
  lotacao_origem: "",
  tempos_autorizados: "",
  unidade: "TEMPOS",
  memo: "",
  inicio: "",
  termino: "",
  tipo: "REAL" as TipoHE,
  observacao: "",
};

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
    .toUpperCase()
    .replace(/º|°/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
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
  // match parcial (ex.: N_TEMPOS_HORAS_SEM_1 → N_TEMPOS)
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const hit = keys.find(
      (k) =>
        k === alias ||
        k.startsWith(`${alias}_`) ||
        k.includes(alias),
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
    // evita "12345.0" / notação científica em matrículas
    if (Number.isInteger(raw) || Math.abs(raw - Math.round(raw)) < 1e-9) {
      return String(Math.round(raw));
    }
    return String(raw);
  }
  return String(raw).trim();
}

function parseTempos(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  const match = text.replace(",", ".").match(/\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function toISODateLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateCell(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toISODateLocal(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const utc = Date.UTC(1899, 11, 30) + Math.round(value) * 86400000;
    return new Date(utc).toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return toISODateLocal(d);
  return null;
}

function parseUnidade(value: unknown): string {
  const text = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  if (!text || parseTempos(value)) return "TEMPOS";
  if (text.includes("HORA")) return "HORAS";
  if (text.includes("TEMPO")) return "TEMPOS";
  return text.slice(0, 40) || "TEMPOS";
}

function parseTipoHe(value: unknown): string {
  const text = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  if (!text) return "REAL";
  if (text.includes("TEMPOR") || text === "T") return "TEMPORARIA";
  return "REAL";
}

function parseHoraExtraExcel(buffer: ArrayBuffer, fileName?: string) {
  const isCsv =
    fileName?.toLowerCase().endsWith(".csv") ||
    (() => {
      const head = decodeSpreadsheetText(buffer.slice(0, 120));
      return head.includes(";") && !head.includes("PK");
    })();

  let wb: XLSX.WorkBook;
  if (isCsv) {
    const text = decodeSpreadsheetText(buffer);
    const first = text.split(/\r?\n/)[0] ?? "";
    const FS =
      (first.match(/;/g) ?? []).length >= (first.match(/,/g) ?? []).length
        ? ";"
        : ",";
    wb = XLSX.read(text, { type: "string", FS, cellDates: true });
  } else {
    wb = XLSX.read(buffer, { type: "array", cellDates: true });
  }

  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("Planilha vazia");

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });

  if (rawRows.length === 0) {
    throw new Error("Nenhuma linha encontrada na planilha");
  }

  const headerKeys = Object.keys(rawRows[0] ?? {}).map((k) =>
    normalizeHeader(k),
  );
  const pareceLotacaoProf =
    headerKeys.some((k) => k.includes("TIPOHORA") || k === "TIPO_HORA") &&
    headerKeys.some((k) => k === "ESCOLA" || k.includes("LOTAC")) &&
    !headerKeys.some(
      (k) =>
        k.includes("N_TEMPOS") ||
        k === "TEMPOS" ||
        k.includes("TEMPOS_HORAS") ||
        k.includes("OF_MEMO"),
    );
  if (pareceLotacaoProf) {
    throw new Error(
      "Este arquivo é o relatório de lotação de professores (tipohora/escola), não o de Hora Extra. Importe em Configuração → Professores.",
    );
  }

  const parsed = rawRows.map((row) => {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const norm = normalizeHeader(key);
      if (!norm || norm.startsWith("EMPTY") || norm.startsWith("__")) continue;
      // se houver colunas duplicadas, mantém a primeira não vazia
      if (
        mapped[norm] !== undefined &&
        mapped[norm] !== null &&
        String(mapped[norm]).trim() !== ""
      ) {
        continue;
      }
      mapped[norm] = value;
    }

    const nTempos = cellRaw(mapped, [
      "N_TEMPOS_HORAS",
      "N_TEMPOS",
      "NUM_TEMPOS_HORAS",
      "NUMERO_TEMPOS_HORAS",
      "NUMERO_DE_TEMPOS",
      "QTD_TEMPOS",
      "QUANTIDADE_TEMPOS",
      "TEMPOS",
    ]);
    const unidadeRaw = cellRaw(mapped, [
      "TEMPOS_HORAS",
      "UNIDADE",
      "UNIDADE_TEMPOS",
      "TEMPO_HORA",
    ]);

    const tempos =
      parseTempos(nTempos) ??
      (parseTempos(unidadeRaw) && !String(unidadeRaw ?? "").match(/[A-Za-z]/)
        ? parseTempos(unidadeRaw)
        : null);

    return {
      matricula: cellStr(mapped, ["MATRICULA", "MAT", "MATRIC"]),
      nome: cellStr(mapped, ["FUNCIONARIO", "NOME", "PROFESSOR", "SERVIDOR"]),
      cargo: cellStr(mapped, ["CARGO"]) || null,
      funcao: cellStr(mapped, ["FUNCAO"]) || null,
      lotacao_origem:
        cellStr(mapped, ["LOTACAO", "LOTACAO_ORIGEM", "LOTACAO_DE_ORIGEM"]) ||
        null,
      tempos_autorizados: tempos,
      unidade: parseUnidade(unidadeRaw),
      memo:
        cellStr(mapped, [
          "OF_MEMO",
          "OFICIO_MEMO",
          "OF_MEMO_N",
          "MEMO",
          "OFICIO",
        ]) || null,
      inicio: parseDateCell(cellRaw(mapped, ["INICIO", "DATA_INICIO"])),
      termino: parseDateCell(
        cellRaw(mapped, ["TERMINO", "TERMINO", "FIM", "DATA_TERMINO", "DATA_FIM"]),
      ),
      tipo: parseTipoHe(cellRaw(mapped, ["TIPO_DE_HE", "TIPO_HE", "TIPO"])),
      observacao:
        cellStr(mapped, ["OBSERVACAO", "OBSERVACOES", "OBS", "OBS_"]) || null,
    };
  });

  // remove linhas totalmente vazias
  return parsed.filter(
    (r) =>
      r.matricula ||
      r.nome ||
      r.tempos_autorizados ||
      r.memo ||
      r.lotacao_origem ||
      r.observacao,
  );
}

export function HoraExtraPage() {
  const { isAdmin } = useAuth();
  const [itens, setItens] = useState<HoraExtra[]>([]);
  const [total, setTotal] = useState(0);
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [lotacoesOpcoes, setLotacoesOpcoes] = useState<string[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingInativar, setPendingInativar] = useState<HoraExtra | null>(null);
  const [pendingInativarTodas, setPendingInativarTodas] = useState(false);
  const [inativando, setInativando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [buscaProfessor, setBuscaProfessor] = useState("");
  const [openProfSelect, setOpenProfSelect] = useState(false);
  const [buscaLotacao, setBuscaLotacao] = useState("");
  const [openLotacaoSelect, setOpenLotacaoSelect] = useState(false);
  const profSelectRef = useRef<HTMLDivElement>(null);
  const lotacaoSelectRef = useRef<HTMLDivElement>(null);
  const profListId = useId();
  const lotacaoListId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const buscaDeferred = useDeferredValue(busca);

  const loadLookups = useCallback(async () => {
    const [profs, lotacoes] = await Promise.all([
      api<Professor[]>("/professores"),
      api<string[]>("/lotacao/opcoes"),
    ]);
    setProfessores(profs);
    setLotacoesOpcoes(lotacoes);
  }, []);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (buscaDeferred.trim()) params.set("q", buscaDeferred.trim());
      const he = await api<Paginated<HoraExtra>>(
        `/horas-extra?${params.toString()}`,
      );
      setItens(he.items);
      setTotal(he.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    }
  }, [page, buscaDeferred]);

  useEffect(() => {
    void loadLookups().catch((err) =>
      setError(err instanceof Error ? err.message : "Erro ao carregar"),
    );
  }, [loadLookups]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paginaAtual = itens;

  const inicio = total === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1;
  const fim = Math.min(pageSafe * PAGE_SIZE, total);

  function escolherProfessor(p: Professor) {
    setForm((f) => ({
      ...f,
      matricula: p.matricula,
      nome: p.nome,
      cargo: p.cargo ?? "",
      funcao: p.funcao ?? "",
      lotacao_origem: p.lotacao?.trim() || f.lotacao_origem,
    }));
    setBuscaProfessor("");
    setOpenProfSelect(false);
  }

  function escolherLotacao(nome: string) {
    setForm((f) => ({ ...f, lotacao_origem: nome }));
    setBuscaLotacao("");
    setOpenLotacaoSelect(false);
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!profSelectRef.current?.contains(e.target as Node)) {
        setOpenProfSelect(false);
        setBuscaProfessor("");
      }
      if (!lotacaoSelectRef.current?.contains(e.target as Node)) {
        setOpenLotacaoSelect(false);
        setBuscaLotacao("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const qProf = buscaProfessor.trim().toLowerCase();
  const professoresFiltrados = qProf
    ? professores.filter(
        (p) =>
          p.nome.toLowerCase().includes(qProf) ||
          p.matricula.toLowerCase().includes(qProf),
      )
    : professores;

  const qLot = buscaLotacao.trim().toLowerCase();
  const lotacoesFiltradas = qLot
    ? lotacoesOpcoes.filter((l) => l.toLowerCase().includes(qLot))
    : lotacoesOpcoes;

  function abrirNova() {
    setEditing(null);
    setForm(emptyForm);
    setBuscaProfessor("");
    setOpenProfSelect(false);
    setBuscaLotacao("");
    setOpenLotacaoSelect(false);
    setFormError(null);
    setModalOpen(true);
  }

  function abrirEditar(h: HoraExtra) {
    const p = professores.find((x) => x.matricula === h.matricula);
    setEditing(h.id);
    setBuscaProfessor("");
    setOpenProfSelect(false);
    setBuscaLotacao("");
    setOpenLotacaoSelect(false);
    setForm({
      matricula: h.matricula,
      nome: h.professor_nome || p?.nome || "",
      cargo: h.professor_cargo ?? p?.cargo ?? "",
      funcao: h.professor_funcao ?? p?.funcao ?? "",
      lotacao_origem: h.lotacao_origem ?? "",
      tempos_autorizados: String(h.tempos_autorizados),
      unidade: h.unidade?.toUpperCase().includes("HORA") ? "HORAS" : "TEMPOS",
      memo: h.memo ?? "",
      inicio: h.inicio ?? "",
      termino: h.termino ?? "",
      tipo: h.tipo,
      observacao: h.observacao ?? "",
    });
    setFormError(null);
    setModalOpen(true);
  }

  function fecharModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setBuscaProfessor("");
    setOpenProfSelect(false);
    setBuscaLotacao("");
    setOpenLotacaoSelect(false);
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
        lotacao_origem: form.lotacao_origem.trim() || null,
        tempos_autorizados: Number(form.tempos_autorizados),
        unidade: form.unidade,
        memo: form.memo.trim() || null,
        inicio: form.inicio || null,
        termino: form.termino || null,
        tipo: form.tipo,
        observacao: form.observacao.trim() || null,
      };
      if (editing) {
        await api(`/horas-extra/${editing}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/horas-extra", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      fecharModal();
      await Promise.all([load(), loadLookups()]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  async function confirmarInativar() {
    if (!pendingInativar) return;
    setInativando(true);
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
      setInativando(false);
    }
  }

  async function confirmarInativarTodas() {
    setInativando(true);
    try {
      await api<{ inativadas: number }>("/horas-extra/inativar-todas", {
        method: "POST",
      });
      setPendingInativarTodas(false);
      setPage(1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao inativar tudo");
      setPendingInativarTodas(false);
    } finally {
      setInativando(false);
    }
  }

  async function onImportFile(file: File | null) {
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const itensImport = parseHoraExtraExcel(buffer, file.name);
      const result = await api<ImportResult>("/horas-extra/import", {
        method: "POST",
        body: JSON.stringify({ itens: itensImport }),
      });
      setImportResult(result);
      setPage(1);
      await Promise.all([load(), loadLookups()]);
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
        title="Hora Extra"
        description="Autorizações ativas de tempos. Inativar remove do relatório e mantém o histórico na ficha do professor."
        actions={
          <>
            {isAdmin ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) =>
                    void onImportFile(e.target.files?.[0] ?? null)
                  }
                />
                <button
                  type="button"
                  className={btnDanger}
                  disabled={
                    importing || inativando || (total === 0 && !busca.trim())
                  }
                  onClick={() => setPendingInativarTodas(true)}
                >
                  Inativar todas
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
            <button type="button" className={btnPrimary} onClick={abrirNova}>
              Nova HE
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
                placeholder="Professor, matrícula, memo, tipo..."
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
                ? "Nenhuma HE encontrada para essa pesquisa."
                : "Nenhuma hora extra cadastrada."
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
                    <th className="px-2 py-2 font-medium">Tempos</th>
                    <th className="px-2 py-2 font-medium">Início</th>
                    <th className="px-2 py-2 font-medium">Término</th>
                    <th className="px-2 py-2 font-medium">Tipo</th>
                    <th className="px-2 py-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginaAtual.map((h) => (
                    <tr key={h.id} className="border-b border-border/70">
                      <td className="px-2 py-2 whitespace-nowrap">
                        {h.matricula}
                      </td>
                      <td className="px-2 py-2">
                        <Link
                          to={`/professores/${h.matricula}`}
                          state={{ from: "/hora-extra" }}
                          className="text-brand underline-offset-2 hover:underline"
                        >
                          {h.professor_nome ?? h.matricula}
                        </Link>
                      </td>
                      <td className="px-2 py-2">{h.professor_cargo ?? "—"}</td>
                      <td className="px-2 py-2">{h.professor_funcao ?? "—"}</td>
                      <td className="px-2 py-2 font-medium">
                        {h.tempos_autorizados}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {formatDateBR(h.inicio)}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {formatDateBR(h.termino)}
                      </td>
                      <td className="px-2 py-2">{TIPO_HE_LABEL[h.tipo]}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <IconEditButton
                            label={`Editar HE de ${h.professor_nome ?? h.matricula}`}
                            onClick={() => abrirEditar(h)}
                          />
                          <IconCloseButton
                            label={`Inativar HE de ${h.professor_nome ?? h.matricula}`}
                            title="Inativar"
                            onClick={() => setPendingInativar(h)}
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
        title={editing ? "Editar HE" : "Nova HE"}
        onClose={fecharModal}
        wide
      >
        <ErrorBanner message={formError} />
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Professor">
            <div className="relative" ref={profSelectRef}>
              <input
                className={inputClass}
                role="combobox"
                aria-expanded={openProfSelect}
                aria-controls={profListId}
                aria-autocomplete="list"
                autoFocus
                placeholder={
                  form.matricula
                    ? `${form.nome} (${form.matricula})`
                    : "Buscar nome ou matrícula…"
                }
                value={openProfSelect || buscaProfessor ? buscaProfessor : ""}
                onFocus={() => setOpenProfSelect(true)}
                onChange={(e) => {
                  setBuscaProfessor(e.target.value);
                  setOpenProfSelect(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setOpenProfSelect(false);
                    setBuscaProfessor("");
                  }
                  if (e.key === "Enter" && professoresFiltrados[0]) {
                    e.preventDefault();
                    escolherProfessor(professoresFiltrados[0]);
                  }
                  if (
                    e.key === "Backspace" &&
                    !buscaProfessor &&
                    form.matricula
                  ) {
                    setForm((f) => ({
                      ...f,
                      matricula: "",
                      nome: "",
                      cargo: "",
                      funcao: "",
                    }));
                  }
                }}
              />
              {openProfSelect ? (
                <ul
                  id={profListId}
                  role="listbox"
                  className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-lg"
                >
                  {professoresFiltrados.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-muted">
                      Nenhum professor encontrado.
                    </li>
                  ) : (
                    professoresFiltrados.slice(0, 80).map((p) => {
                      const active = p.matricula === form.matricula;
                      return (
                        <li
                          key={p.matricula}
                          role="option"
                          aria-selected={active}
                        >
                          <button
                            type="button"
                            className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm transition ${
                              active
                                ? "bg-brand-soft/50"
                                : "hover:bg-brand-soft/25"
                            }`}
                            onMouseDown={(ev) => ev.preventDefault()}
                            onClick={() => escolherProfessor(p)}
                          >
                            <span className="font-medium leading-snug">
                              {p.nome}
                            </span>
                            <span className="text-xs text-muted">
                              {p.matricula}
                              {p.cargo ? ` · ${p.cargo}` : ""}
                              {p.funcao ? ` · ${p.funcao}` : ""}
                            </span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              ) : null}
            </div>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Matrícula">
              <input
                className={`${inputClass} bg-background`}
                required
                readOnly
                value={form.matricula}
              />
            </Field>
            <Field label="Funcionário">
              <input
                className={inputClass}
                required
                value={form.nome}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nome: e.target.value }))
                }
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
          <Field label="Lotação">
            <div className="relative" ref={lotacaoSelectRef}>
              <input
                className={inputClass}
                role="combobox"
                aria-expanded={openLotacaoSelect}
                aria-controls={lotacaoListId}
                aria-autocomplete="list"
                placeholder={
                  form.lotacao_origem
                    ? form.lotacao_origem
                    : "Buscar ou digitar lotação…"
                }
                value={openLotacaoSelect ? buscaLotacao : ""}
                onFocus={() => {
                  setOpenLotacaoSelect(true);
                  setBuscaLotacao(form.lotacao_origem);
                }}
                onChange={(e) => {
                  const v = e.target.value;
                  setBuscaLotacao(v);
                  setForm((f) => ({ ...f, lotacao_origem: v }));
                  setOpenLotacaoSelect(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setOpenLotacaoSelect(false);
                    setBuscaLotacao("");
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (lotacoesFiltradas[0]) {
                      escolherLotacao(lotacoesFiltradas[0]);
                    } else if (buscaLotacao.trim()) {
                      escolherLotacao(buscaLotacao.trim());
                    }
                  }
                }}
              />
              {openLotacaoSelect ? (
                <ul
                  id={lotacaoListId}
                  role="listbox"
                  className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-lg"
                >
                  {buscaLotacao.trim() &&
                  !lotacoesFiltradas.some(
                    (l) =>
                      l.toLowerCase() === buscaLotacao.trim().toLowerCase(),
                  ) ? (
                    <li role="option">
                      <button
                        type="button"
                        className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-brand-soft/25"
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => escolherLotacao(buscaLotacao.trim())}
                      >
                        <span className="font-medium">
                          Usar “{buscaLotacao.trim()}”
                        </span>
                        <span className="text-xs text-muted">Novo valor</span>
                      </button>
                    </li>
                  ) : null}
                  {lotacoesFiltradas.length === 0 && !buscaLotacao.trim() ? (
                    <li className="px-3 py-2 text-sm text-muted">
                      Nenhuma lotação cadastrada. Digite para criar.
                    </li>
                  ) : (
                    lotacoesFiltradas.slice(0, 80).map((l) => {
                      const active = l === form.lotacao_origem;
                      return (
                        <li key={l} role="option" aria-selected={active}>
                          <button
                            type="button"
                            className={`flex w-full px-3 py-2 text-left text-sm transition ${
                              active
                                ? "bg-brand-soft/50 font-medium"
                                : "hover:bg-brand-soft/25"
                            }`}
                            onMouseDown={(ev) => ev.preventDefault()}
                            onClick={() => escolherLotacao(l)}
                          >
                            {l}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              ) : null}
            </div>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="N° tempos/horas">
              <input
                className={inputClass}
                type="number"
                min={1}
                required
                value={form.tempos_autorizados}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    tempos_autorizados: e.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Tempos/horas">
              <select
                className={inputClass}
                value={form.unidade}
                onChange={(e) =>
                  setForm((f) => ({ ...f, unidade: e.target.value }))
                }
              >
                <option value="TEMPOS">TEMPOS</option>
                <option value="HORAS">HORAS</option>
              </select>
            </Field>
          </div>
          <Field label="Of./Memo">
            <input
              className={inputClass}
              value={form.memo}
              onChange={(e) =>
                setForm((f) => ({ ...f, memo: e.target.value }))
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início">
              <input
                className={inputClass}
                type="date"
                value={form.inicio}
                onChange={(e) =>
                  setForm((f) => ({ ...f, inicio: e.target.value }))
                }
              />
            </Field>
            <Field label="Término">
              <input
                className={inputClass}
                type="date"
                value={form.termino}
                onChange={(e) =>
                  setForm((f) => ({ ...f, termino: e.target.value }))
                }
              />
            </Field>
          </div>
          <Field label="Tipo de HE">
            <select
              className={inputClass}
              value={form.tipo}
              onChange={(e) =>
                setForm((f) => ({ ...f, tipo: e.target.value as TipoHE }))
              }
            >
              <option value="REAL">Real</option>
              <option value="TEMPORARIA">Temporária</option>
            </select>
          </Field>
          <Field label="Observação">
            <textarea
              className={inputClass}
              rows={3}
              value={form.observacao}
              onChange={(e) =>
                setForm((f) => ({ ...f, observacao: e.target.value }))
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
              HE criada(s)
            </p>
            <p>
              <span className="font-medium text-muted">
                {importResult.ignorados}
              </span>{" "}
              ignorada(s)
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
        open={!!pendingInativar}
        title="Inativar hora extra"
        message={
          pendingInativar
            ? `Inativar a HE de ${pendingInativar.professor_nome ?? pendingInativar.matricula} (${pendingInativar.tempos_autorizados} tempos)? Ela sai deste relatório, mas permanece no histórico da ficha do professor.`
            : ""
        }
        confirmLabel="Inativar"
        loading={inativando}
        onConfirm={() => void confirmarInativar()}
        onClose={() => {
          if (!inativando) setPendingInativar(null);
        }}
      />

      <ConfirmDialog
        open={pendingInativarTodas}
        title="Inativar todas as HEs"
        message="Isso inativa TODAS as autorizações ativas de hora extra (não só as da página ou do filtro). Elas saem deste relatório e ficam só no histórico da ficha de cada professor."
        confirmLabel="Inativar todas"
        loading={inativando}
        onConfirm={() => void confirmarInativarTodas()}
        onClose={() => {
          if (!inativando) setPendingInativarTodas(false);
        }}
      />
    </div>
  );
}
