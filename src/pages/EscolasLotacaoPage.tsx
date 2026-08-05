import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  Panel,
  btnSecondary,
  inputClass,
} from "@/components/ui";
import { api } from "@/lib/api";
import type {
  EscolaLotacao,
  FuncionarioLotacao,
  LotacaoContagemItem,
  LotacaoContagens,
} from "@/lib/types";

type AbaEscolas = "funcionarios" | "contagens";

function tipohoraBadge(tipohora: string | null) {
  const t = (tipohora ?? "").toUpperCase();
  const isExtra = t.includes("EXTRA");
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${
        isExtra
          ? "bg-amber-100 text-amber-900"
          : "bg-brand-soft/60 text-foreground"
      }`}
    >
      {tipohora?.trim() || "—"}
    </span>
  );
}

function labelEscola(e: EscolaLotacao) {
  return `${e.nome} (${e.total} func.${e.hora_extra > 0 ? ` · ${e.hora_extra} H.E.` : ""})`;
}

function valorFiltro(v: string | null | undefined) {
  const t = (v ?? "").trim();
  return t || "(vazio)";
}

function MultiFilterSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const listId = useId();

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setBusca("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const q = busca.trim().toLowerCase();
  const filtradas = q
    ? options.filter((o) => o.toLowerCase().includes(q))
    : options;

  function toggle(valor: string) {
    const next = new Set(selected);
    if (next.has(valor)) next.delete(valor);
    else next.add(valor);
    onChange(next);
  }

  const count = selected.size;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        className={`inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs font-medium transition hover:bg-brand-soft/40 ${
          count > 0 ? "text-brand" : "text-muted"
        }`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{label}</span>
        {count > 0 ? (
          <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {count}
          </span>
        ) : (
          <span className="text-[10px] opacity-60">▾</span>
        )}
      </button>

      {open ? (
        <div
          id={listId}
          className="absolute left-0 top-full z-30 mt-1 w-64 rounded-md border border-border bg-surface shadow-lg"
        >
          <div className="border-b border-border p-2">
            <input
              className={inputClass}
              placeholder={`Buscar ${label.toLowerCase()}...`}
              value={busca}
              autoFocus
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setOpen(false);
                  setBusca("");
                }
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
            <button
              type="button"
              className="text-[11px] text-brand hover:underline"
              onClick={() => onChange(new Set(options))}
            >
              Todos
            </button>
            <button
              type="button"
              className="text-[11px] text-muted hover:underline"
              onClick={() => onChange(new Set())}
              disabled={count === 0}
            >
              Limpar
            </button>
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtradas.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted">Nenhuma opção</li>
            ) : (
              filtradas.map((opt) => {
                const checked = selected.has(opt);
                return (
                  <li key={opt}>
                    <label className="flex cursor-pointer items-start gap-2 px-3 py-1.5 text-xs hover:bg-brand-soft/30">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={checked}
                        onChange={() => toggle(opt)}
                      />
                      <span className="min-w-0 break-words leading-snug">
                        {opt}
                      </span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function EscolasLotacaoPage() {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [escolas, setEscolas] = useState<EscolaLotacao[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [funcionarios, setFuncionarios] = useState<FuncionarioLotacao[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingEscolas, setLoadingEscolas] = useState(false);
  const [loadingFuncs, setLoadingFuncs] = useState(false);
  const [buscaEscola, setBuscaEscola] = useState("");
  const [openSelect, setOpenSelect] = useState(false);
  const [buscaFunc, setBuscaFunc] = useState("");
  const [filtroCargo, setFiltroCargo] = useState<Set<string>>(() => new Set());
  const [filtroFuncao, setFiltroFuncao] = useState<Set<string>>(
    () => new Set(),
  );
  const [filtroTipoHora, setFiltroTipoHora] = useState<Set<string>>(
    () => new Set(),
  );
  const [aba, setAba] = useState<AbaEscolas>("funcionarios");
  const [contagens, setContagens] = useState<LotacaoContagens | null>(null);
  const [loadingContagens, setLoadingContagens] = useState(false);
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);
  const pdfMenuRef = useRef<HTMLDivElement>(null);
  const buscaFuncDeferred = useDeferredValue(buscaFunc);

  const loadEscolas = useCallback(async () => {
    setLoadingEscolas(true);
    setError(null);
    try {
      const data = await api<EscolaLotacao[]>("/lotacao/escolas");
      setEscolas(data);
      setSelected((prev) => {
        if (!prev) return data[0]?.nome ?? null;
        if (data.some((e) => e.nome === prev)) return prev;
        return data[0]?.nome ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar escolas");
    } finally {
      setLoadingEscolas(false);
    }
  }, []);

  useEffect(() => {
    void loadEscolas();
  }, [loadEscolas]);

  const loadFuncionarios = useCallback(async () => {
    if (!selected) {
      setFuncionarios([]);
      return;
    }
    setLoadingFuncs(true);
    setError(null);
    try {
      const params = new URLSearchParams({ escola: selected });
      if (buscaFuncDeferred.trim()) params.set("q", buscaFuncDeferred.trim());
      const data = await api<{ items: FuncionarioLotacao[] }>(
        `/lotacao/funcionarios?${params.toString()}`,
      );
      setFuncionarios(data.items);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao carregar funcionários",
      );
    } finally {
      setLoadingFuncs(false);
    }
  }, [selected, buscaFuncDeferred]);

  useEffect(() => {
    void loadFuncionarios();
  }, [loadFuncionarios]);

  const loadContagens = useCallback(async () => {
    if (!selected) {
      setContagens(null);
      return;
    }
    setLoadingContagens(true);
    setError(null);
    try {
      const params = new URLSearchParams({ escola: selected });
      const data = await api<LotacaoContagens>(
        `/lotacao/contagens?${params.toString()}`,
      );
      setContagens(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao carregar contagens",
      );
    } finally {
      setLoadingContagens(false);
    }
  }, [selected]);

  useEffect(() => {
    if (aba === "contagens") void loadContagens();
  }, [aba, loadContagens]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpenSelect(false);
      }
      if (!pdfMenuRef.current?.contains(e.target as Node)) {
        setPdfMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const escolaAtual = escolas.find((e) => e.nome === selected) ?? null;
  const totalGeral = escolas.reduce((acc, e) => acc + e.total, 0);

  const qEscola = buscaEscola.trim().toLowerCase();
  const escolasFiltradas = qEscola
    ? escolas.filter((e) => e.nome.toLowerCase().includes(qEscola))
    : escolas;

  const opcoesCargo = [
    ...new Set(funcionarios.map((f) => valorFiltro(f.cargo))),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const opcoesFuncao = [
    ...new Set(funcionarios.map((f) => valorFiltro(f.funcao))),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const opcoesTipoHora = [
    ...new Set(funcionarios.map((f) => valorFiltro(f.tipohora))),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const funcionariosFiltrados = funcionarios.filter((f) => {
    if (filtroCargo.size > 0 && !filtroCargo.has(valorFiltro(f.cargo))) {
      return false;
    }
    if (filtroFuncao.size > 0 && !filtroFuncao.has(valorFiltro(f.funcao))) {
      return false;
    }
    if (
      filtroTipoHora.size > 0 &&
      !filtroTipoHora.has(valorFiltro(f.tipohora))
    ) {
      return false;
    }
    return true;
  });

  function escolherEscola(nome: string) {
    setSelected(nome);
    setBuscaEscola("");
    setBuscaFunc("");
    setFiltroCargo(new Set());
    setFiltroFuncao(new Set());
    setFiltroTipoHora(new Set());
    setOpenSelect(false);
  }

  const temFiltroColuna =
    filtroCargo.size > 0 || filtroFuncao.size > 0 || filtroTipoHora.size > 0;

  function downloadPdfContagens(tipo: "cargos" | "funcoes" | "ambos") {
    if (!contagens || !selected || !escolaAtual) return;
    setPdfMenuOpen(false);

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(selected, 14, 20);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const subtitulo = `${escolaAtual.total} na lotação · ${escolaAtual.normal} normal · ${escolaAtual.hora_extra} hora extra`;
    doc.text(subtitulo, 14, 28);

    let currentY = 38;

    const addTable = (titulo: string, itens: LotacaoContagemItem[]) => {
      if (itens.length === 0) return;

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(titulo, 14, currentY);
      currentY += 6;

      const soma = itens.reduce((acc, i) => acc + i.total, 0);
      const somaNormal = itens.reduce((acc, i) => acc + i.normal, 0);
      const somaHe = itens.reduce((acc, i) => acc + i.hora_extra, 0);

      const body = itens.map((item) => [
        item.nome,
        item.total.toString(),
        item.normal.toString(),
        item.hora_extra.toString(),
      ]);
      body.push(["TOTAL", soma.toString(), somaNormal.toString(), somaHe.toString()]);

      autoTable(doc, {
        startY: currentY,
        head: [[titulo, "Total", "Normal", "H.E."]],
        body,
        theme: "grid",
        headStyles: { fillColor: [59, 130, 246], fontStyle: "bold" },
        footStyles: { fillColor: [240, 240, 240], fontStyle: "bold" },
        margin: { left: 14, right: 14 },
        styles: { fontSize: 9 },
        didParseCell: (data) => {
          if (data.row.index === body.length - 1) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [240, 240, 240];
          }
        },
      });

      currentY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
    };

    if (tipo === "cargos" || tipo === "ambos") {
      addTable("Cargos", contagens.cargos);
    }
    if (tipo === "funcoes" || tipo === "ambos") {
      addTable("Funções", contagens.funcoes);
    }

    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Gerado em ${new Date().toLocaleString("pt-BR")}`,
      pageWidth - 14,
      doc.internal.pageSize.getHeight() - 10,
      { align: "right" },
    );

    const sufixo = tipo === "ambos" ? "" : `-${tipo}`;
    const nomeArquivo = `lotacao-${selected.replace(/[^a-zA-Z0-9]/g, "_")}${sufixo}.pdf`;
    doc.save(nomeArquivo);
  }

  function downloadPdfFuncionarios() {
    if (!selected || !escolaAtual || funcionariosFiltrados.length === 0) return;

    const doc = new jsPDF({ orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(selected, 14, 20);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    let subtitulo = `${escolaAtual.total} na lotação · ${escolaAtual.normal} normal · ${escolaAtual.hora_extra} hora extra`;
    if (temFiltroColuna) {
      subtitulo += ` · Mostrando ${funcionariosFiltrados.length} funcionário(s)`;
    }
    doc.text(subtitulo, 14, 28);

    const body = funcionariosFiltrados.map((f) => [
      f.matricula,
      f.nome,
      f.cargo || "—",
      f.funcao || "—",
      f.tipohora || "—",
      f.lotacao || "—",
    ]);

    autoTable(doc, {
      startY: 36,
      head: [["Matrícula", "Nome", "Cargo", "Função", "Tipo Hora", "Lotação"]],
      body,
      theme: "grid",
      headStyles: { fillColor: [59, 130, 246], fontStyle: "bold" },
      margin: { left: 14, right: 14 },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 35 },
        3: { cellWidth: 30 },
        4: { cellWidth: 30 },
        5: { cellWidth: 40 },
      },
    });

    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Gerado em ${new Date().toLocaleString("pt-BR")} · ${funcionariosFiltrados.length} funcionário(s)`,
      pageWidth - 14,
      doc.internal.pageSize.getHeight() - 10,
      { align: "right" },
    );

    const nomeArquivo = `funcionarios-${selected.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    doc.save(nomeArquivo);
  }

  function ContagemTable({
    titulo,
    itens,
  }: {
    titulo: string;
    itens: LotacaoContagemItem[];
  }) {
    if (itens.length === 0) {
      return (
        <Panel>
          <h3 className="mb-2 text-sm font-semibold">{titulo}</h3>
          <EmptyState message={`Nenhum ${titulo.toLowerCase()} nesta escola.`} />
        </Panel>
      );
    }
    const soma = itens.reduce((acc, i) => acc + i.total, 0);
    const somaNormal = itens.reduce((acc, i) => acc + i.normal, 0);
    const somaHe = itens.reduce((acc, i) => acc + i.hora_extra, 0);
    return (
      <Panel>
        <div className="mb-3 flex items-end justify-between gap-2">
          <h3 className="text-sm font-semibold">{titulo}</h3>
          <p className="text-xs text-muted">
            {itens.length} tipo(s) · {soma} lotação(ões)
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="pb-2 pr-3 font-medium">{titulo}</th>
                <th className="pb-2 pr-3 font-medium text-right">Total</th>
                <th className="pb-2 pr-3 font-medium text-right">Normal</th>
                <th className="pb-2 font-medium text-right">H.E.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {itens.map((item) => (
                <tr key={item.nome}>
                  <td className="py-2 pr-3 font-medium">{item.nome}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {item.total}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted">
                    {item.normal}
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted">
                    {item.hora_extra}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-brand-soft/40">
                <td className="py-2.5 pr-3 font-semibold text-brand-dark">
                  Total
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums font-semibold">
                  {soma}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums font-semibold">
                  {somaNormal}
                </td>
                <td className="py-2.5 text-right tabular-nums font-semibold">
                  {somaHe}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>
    );
  }

  return (
    <div>
      <PageHeader
        title="Escolas"
        description="Funcionários lotados em cada unidade, conforme a importação de professores."
      />
      <ErrorBanner message={error} />

      <Panel className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full min-w-0 flex-1" ref={wrapRef}>
            <Field label="Escola">
              <div className="relative">
                <input
                  className={inputClass}
                  role="combobox"
                  aria-expanded={openSelect}
                  aria-controls={listId}
                  aria-autocomplete="list"
                  placeholder={
                    loadingEscolas
                      ? "Carregando escolas..."
                      : selected
                        ? labelEscola(
                            escolas.find((e) => e.nome === selected) ?? {
                              nome: selected,
                              total: 0,
                              hora_extra: 0,
                              normal: 0,
                            },
                          )
                        : "Buscar e selecionar escola..."
                  }
                  value={openSelect || buscaEscola ? buscaEscola : ""}
                  disabled={loadingEscolas || escolas.length === 0}
                  onFocus={() => setOpenSelect(true)}
                  onChange={(e) => {
                    setBuscaEscola(e.target.value);
                    setOpenSelect(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setOpenSelect(false);
                      setBuscaEscola("");
                    }
                    if (e.key === "Enter" && escolasFiltradas[0]) {
                      e.preventDefault();
                      escolherEscola(escolasFiltradas[0].nome);
                    }
                  }}
                />
                {openSelect && !loadingEscolas ? (
                  <ul
                    id={listId}
                    role="listbox"
                    className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-md"
                  >
                    {escolasFiltradas.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-muted">
                        Nenhuma escola encontrada.
                      </li>
                    ) : (
                      escolasFiltradas.map((e) => {
                        const active = e.nome === selected;
                        return (
                          <li key={e.nome} role="option" aria-selected={active}>
                            <button
                              type="button"
                              className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm transition ${
                                active
                                  ? "bg-brand-soft/50"
                                  : "hover:bg-brand-soft/25"
                              }`}
                              onMouseDown={(ev) => ev.preventDefault()}
                              onClick={() => escolherEscola(e.nome)}
                            >
                              <span className="font-medium leading-snug">
                                {e.nome}
                              </span>
                              <span className="text-xs text-muted">
                                {e.total} funcionário
                                {e.total === 1 ? "" : "s"}
                                {e.hora_extra > 0
                                  ? ` · ${e.hora_extra} H.E.`
                                  : ""}
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
          </div>
          <p className="shrink-0 text-sm text-muted sm:pb-2">
            {loadingEscolas
              ? "Carregando..."
              : escolas.length === 0
                ? "Nenhuma escola com lotação"
                : `${escolas.length} escola(s) · ${totalGeral} funcionário(s)`}
          </p>
        </div>
      </Panel>

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            { id: "funcionarios" as const, label: "Funcionários" },
            { id: "contagens" as const, label: "Contagens" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setAba(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              aba === t.id
                ? "bg-brand text-white"
                : "border border-border bg-white text-foreground hover:bg-brand-soft/40"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {aba === "contagens" ? (
        escolas.length === 0 && !loadingEscolas ? (
          <EmptyState message="Importe professores com o campo escola preenchido para ver as contagens." />
        ) : !selected ? (
          <EmptyState message="Selecione uma escola para ver as contagens." />
        ) : loadingContagens ? (
          <Panel>
            <p className="text-sm text-muted">Carregando contagens...</p>
          </Panel>
        ) : contagens ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">{selected}</h2>
                <p className="text-sm text-muted">
                  {escolaAtual
                    ? `${escolaAtual.total} na lotação` +
                      (escolaAtual.hora_extra
                        ? ` · ${escolaAtual.normal} normal · ${escolaAtual.hora_extra} hora extra`
                        : "")
                    : null}
                </p>
              </div>
              <div className="relative" ref={pdfMenuRef}>
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => setPdfMenuOpen((v) => !v)}
                >
                  Baixar PDF ▾
                </button>
                {pdfMenuOpen && (
                  <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-md border border-border bg-surface shadow-lg">
                    <button
                      type="button"
                      className="w-full px-4 py-2 text-left text-sm hover:bg-brand-soft/40"
                      onClick={() => downloadPdfContagens("cargos")}
                    >
                      Só Cargos
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-2 text-left text-sm hover:bg-brand-soft/40"
                      onClick={() => downloadPdfContagens("funcoes")}
                    >
                      Só Funções
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-2 text-left text-sm font-medium hover:bg-brand-soft/40"
                      onClick={() => downloadPdfContagens("ambos")}
                    >
                      Cargos + Funções
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ContagemTable titulo="Cargos" itens={contagens.cargos} />
              <ContagemTable titulo="Funções" itens={contagens.funcoes} />
            </div>
          </div>
        ) : (
          <EmptyState message="Sem dados de contagem." />
        )
      ) : (
        <Panel>
          {escolas.length === 0 && !loadingEscolas ? (
            <EmptyState message="Importe professores com o campo escola preenchido para ver a lotação." />
          ) : !selected ? (
            <EmptyState message="Selecione uma escola para ver os funcionários." />
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold">{selected}</h2>
                  <p className="text-sm text-muted">
                    {escolaAtual
                      ? `${escolaAtual.total} na lotação` +
                        (escolaAtual.hora_extra
                          ? ` · ${escolaAtual.normal} normal · ${escolaAtual.hora_extra} hora extra`
                          : "")
                      : null}
                    {temFiltroColuna
                      ? ` · mostrando ${funcionariosFiltrados.length}`
                      : null}
                  </p>
                </div>
                <div className="flex items-end gap-3">
                  <div className="w-full max-w-xs">
                    <Field label="Filtrar funcionários">
                      <input
                        className={inputClass}
                        placeholder="Nome, matrícula, cargo..."
                        value={buscaFunc}
                        onChange={(e) => setBuscaFunc(e.target.value)}
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={downloadPdfFuncionarios}
                    disabled={funcionariosFiltrados.length === 0}
                  >
                    Baixar PDF
                  </button>
                </div>
              </div>

              {loadingFuncs ? (
                <p className="text-sm text-muted">Carregando funcionários...</p>
              ) : funcionarios.length === 0 ? (
                <EmptyState
                  message={
                    buscaFunc.trim()
                      ? "Nenhum funcionário encontrado para esse filtro."
                      : "Nenhum funcionário nesta escola."
                  }
                />
              ) : funcionariosFiltrados.length === 0 ? (
                <EmptyState message="Nenhum funcionário com os filtros de coluna selecionados." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted">
                        <th className="pb-2 pr-3 font-medium">Matrícula</th>
                        <th className="pb-2 pr-3 font-medium">Nome</th>
                        <th className="pb-2 pr-3 font-medium">
                          <MultiFilterSelect
                            label="Cargo"
                            options={opcoesCargo}
                            selected={filtroCargo}
                            onChange={setFiltroCargo}
                          />
                        </th>
                        <th className="pb-2 pr-3 font-medium">
                          <MultiFilterSelect
                            label="Função"
                            options={opcoesFuncao}
                            selected={filtroFuncao}
                            onChange={setFiltroFuncao}
                          />
                        </th>
                        <th className="pb-2 pr-3 font-medium">
                          <MultiFilterSelect
                            label="Tipo hora"
                            options={opcoesTipoHora}
                            selected={filtroTipoHora}
                            onChange={setFiltroTipoHora}
                          />
                        </th>
                        <th className="pb-2 font-medium">Lotação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {funcionariosFiltrados.map((f) => (
                        <tr
                          key={
                            f.id ??
                            `${f.matricula}-${f.tipohora ?? ""}-${f.lotacao ?? ""}`
                          }
                        >
                          <td className="py-2.5 pr-3 whitespace-nowrap">
                            <Link
                              to={`/professores/${f.matricula}`}
                              state={{ from: "/escolas" }}
                              className="font-medium text-brand hover:underline"
                            >
                              {f.matricula}
                            </Link>
                          </td>
                          <td className="py-2.5 pr-3">{f.nome}</td>
                          <td className="py-2.5 pr-3 text-muted">
                            {f.cargo || "—"}
                          </td>
                          <td className="py-2.5 pr-3 text-muted">
                            {f.funcao || "—"}
                          </td>
                          <td className="py-2.5 pr-3">
                            {tipohoraBadge(f.tipohora)}
                          </td>
                          <td className="py-2.5 text-muted">
                            {f.lotacao || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
