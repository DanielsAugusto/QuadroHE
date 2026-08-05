import { useEffect, useMemo, useState, Fragment, useCallback } from "react";
import { Link } from "react-router-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  EmptyState,
  ErrorBanner,
  Field,
  Modal,
  PageHeader,
  Panel,
  StatCard,
  btnPrimary,
  btnSecondary,
  inputClass,
} from "@/components/ui";
import { api } from "@/lib/api";
import type {
  CarenciaContagens,
  LotacaoContagensGeral,
} from "@/lib/types";

type Aba = "lotacao" | "materias" | "escolas";
type FolhaPdf = "a4" | "a3" | "legal" | "tabloid";
type OrientacaoPdf = "landscape" | "portrait";

const FOLHAS_PDF: Array<{ id: FolhaPdf; label: string }> = [
  { id: "a4", label: "A4" },
  { id: "a3", label: "A3" },
  { id: "legal", label: "Ofício" },
  { id: "tabloid", label: "Tabloide" },
];

type MapaoDimensao = "funcoes" | "cargos";

export function ContagensPage() {
  const [lotacaoByDim, setLotacaoByDim] = useState<{
    funcoes: LotacaoContagensGeral | null;
    cargos: LotacaoContagensGeral | null;
  }>({ funcoes: null, cargos: null });
  const [loadingLotacao, setLoadingLotacao] = useState(true);
  const [carencias, setCarencias] = useState<CarenciaContagens | null>(null);
  const [loadingCarencias, setLoadingCarencias] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<Aba>("lotacao");
  const [expandida, setExpandida] = useState<string | null>(null);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [modalPdfOpen, setModalPdfOpen] = useState(false);
  const [folhaPdf, setFolhaPdf] = useState<FolhaPdf>("a3");
  const [orientacaoPdf, setOrientacaoPdf] =
    useState<OrientacaoPdf>("landscape");
  const [colunasOcultas, setColunasOcultas] = useState<Set<string>>(
    () => new Set(),
  );
  const [painelColunas, setPainelColunas] = useState(false);
  const [buscaColuna, setBuscaColuna] = useState("");
  const [mapaoDimensao, setMapaoDimensao] = useState<MapaoDimensao>("funcoes");

  const lotacao = lotacaoByDim[mapaoDimensao];

  const loadLotacao = useCallback(async (dimensao: MapaoDimensao) => {
    setLoadingLotacao(true);
    setError(null);
    try {
      const lot = await api<LotacaoContagensGeral>(
        `/lotacao/contagens?dimensao=${dimensao}`,
      );
      setLotacaoByDim((prev) => ({ ...prev, [dimensao]: lot }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar lotação");
    } finally {
      setLoadingLotacao(false);
    }
  }, []);

  const lotacaoCache = lotacaoByDim[mapaoDimensao];
  useEffect(() => {
    if (lotacaoCache) {
      setLoadingLotacao(false);
      return;
    }
    void loadLotacao(mapaoDimensao);
  }, [mapaoDimensao, lotacaoCache, loadLotacao]);

  useEffect(() => {
    if (aba !== "materias" && aba !== "escolas") return;
    if (carencias) return;
    let cancelled = false;
    setLoadingCarencias(true);
    setError(null);
    api<CarenciaContagens>("/carencias/contagens")
      .then((data) => {
        if (!cancelled) setCarencias(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Erro ao carregar carências",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCarencias(false);
      });
    return () => {
      cancelled = true;
    };
  }, [aba, carencias]);

  useEffect(() => {
    setExpandida(null);
    setBusca("");
  }, [aba]);

  useEffect(() => {
    setColunasOcultas(new Set());
    setBuscaColuna("");
  }, [mapaoDimensao]);

  const escolasLotacao = useMemo(() => {
    const items = lotacao?.escolas ?? [];
    const q = busca.trim().toLowerCase();
    if (!q) return items;
    return items.filter((e) => {
      if (e.nome.toLowerCase().includes(q)) return true;
      const itens = mapaoDimensao === "funcoes" ? e.funcoes : e.cargos;
      return itens.some((c) => c.nome.toLowerCase().includes(q));
    });
  }, [lotacao, busca, mapaoDimensao]);

  const mapaoColunasTodas = useMemo(() => {
    const totais = new Map<string, number>();
    for (const e of escolasLotacao) {
      const itens = mapaoDimensao === "funcoes" ? e.funcoes : e.cargos;
      for (const item of itens) {
        if (item.normal <= 0) continue;
        totais.set(item.nome, (totais.get(item.nome) ?? 0) + item.normal);
      }
    }
    return [...totais.entries()]
      .sort(
        (a, b) =>
          b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"),
      )
      .map(([nome]) => nome);
  }, [escolasLotacao, mapaoDimensao]);

  const mapaoColunas = useMemo(
    () => mapaoColunasTodas.filter((c) => !colunasOcultas.has(c)),
    [mapaoColunasTodas, colunasOcultas],
  );

  const mapaoTotaisColuna = useMemo(() => {
    const map = new Map<string, number>();
    for (const col of mapaoColunas) map.set(col, 0);
    let normal = 0;
    for (const e of escolasLotacao) {
      const itens = mapaoDimensao === "funcoes" ? e.funcoes : e.cargos;
      const byNome = new Map(itens.map((i) => [i.nome, i.normal]));
      let row = 0;
      for (const col of mapaoColunas) {
        const v = byNome.get(col) ?? 0;
        map.set(col, (map.get(col) ?? 0) + v);
        row += v;
      }
      normal += row;
    }
    return { porColuna: map, normal };
  }, [escolasLotacao, mapaoColunas, mapaoDimensao]);

  function toggleColuna(nome: string) {
    setColunasOcultas((prev) => {
      const next = new Set(prev);
      if (next.has(nome)) next.delete(nome);
      else next.add(nome);
      return next;
    });
  }

  function selecionarTodasColunas() {
    setColunasOcultas(new Set());
  }

  function ocultarTodasColunas() {
    setColunasOcultas(new Set(mapaoColunasTodas));
  }

  const colunasFiltradasPainel = useMemo(() => {
    const q = buscaColuna.trim().toLowerCase();
    if (!q) return mapaoColunasTodas;
    return mapaoColunasTodas.filter((c) => c.toLowerCase().includes(q));
  }, [mapaoColunasTodas, buscaColuna]);

  const baixarMapaoPdf = useCallback(() => {
    if (escolasLotacao.length === 0) return;
    setExportandoPdf(true);
    try {
      const doc = new jsPDF({
        orientation: orientacaoPdf,
        unit: "mm",
        format: folhaPdf,
      });
      const dimensaoLabel =
        mapaoDimensao === "funcoes" ? "Funções" : "Cargos";
      const folhaLabel =
        FOLHAS_PDF.find((f) => f.id === folhaPdf)?.label ?? folhaPdf;
      const titulo = `Mapão de lotação normal · ${dimensaoLabel}`;
      const sub = [
        "Somente lotação normal",
        `${escolasLotacao.length} escola(s)`,
        `${mapaoColunas.length} coluna(s)`,
        `${folhaLabel} · ${orientacaoPdf === "landscape" ? "paisagem" : "retrato"}`,
      ].join(" · ");

      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(titulo, 14, 14);
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(sub, 14, 20);

      const head = [["Escola", ...mapaoColunas, "TOTAL"]];
      const body = escolasLotacao.map((e) => {
        const itens = mapaoDimensao === "funcoes" ? e.funcoes : e.cargos;
        const byNome = new Map(itens.map((i) => [i.nome, i.normal]));
        const vals = mapaoColunas.map((col) => byNome.get(col) ?? 0);
        const rowNormal = vals.reduce((acc, v) => acc + v, 0);
        return [
          e.nome,
          ...vals.map((v) => (v > 0 ? String(v) : "")),
          String(rowNormal),
        ];
      });
      body.push([
        "Total",
        ...mapaoColunas.map((col) =>
          String(mapaoTotaisColuna.porColuna.get(col) ?? 0),
        ),
        String(mapaoTotaisColuna.normal),
      ]);

      const colCount = head[0].length;
      const pageW = doc.internal.pageSize.getWidth();
      const marginX = 8;
      const usableW = pageW - marginX * 2;
      const midCols = Math.max(1, colCount - 2);

      // Larguras preferidas — com poucas colunas não estica a tabela na página
      const preferredEscolaW = 42;
      const preferredMidW = 8;
      const preferredNormalW = preferredMidW;
      const naturalW =
        preferredEscolaW + midCols * preferredMidW + preferredNormalW;

      let escolaW: number;
      let normalW: number;
      let midW: number;
      let tableWidth: number | "wrap";

      if (naturalW <= usableW) {
        escolaW = preferredEscolaW;
        normalW = preferredNormalW;
        midW = preferredMidW;
        tableWidth = naturalW;
      } else {
        // Muitas colunas: comprime para caber na folha
        escolaW = Math.min(preferredEscolaW, usableW * 0.16);
        normalW = Math.min(preferredNormalW, usableW * 0.05);
        midW = Math.max(3.2, (usableW - escolaW - normalW) / midCols);
        tableWidth = usableW;
      }

      const fontSize =
        midW < 4 ? 4 : midW < 5.5 ? 5 : midW < 7 ? 6 : 7;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(fontSize);
      const maxTextW = Math.max(
        18,
        doc.getTextWidth("TOTAL"),
        ...mapaoColunas.map((c) => doc.getTextWidth(c)),
      );
      // Altura do cabeçalho = comprimento do texto em pé + folga
      const headHeight = Math.min(72, maxTextW + 8);

      autoTable(doc, {
        startY: 24,
        head,
        body,
        theme: "grid",
        tableWidth,
        styles: {
          fontSize,
          cellPadding: 0.5,
          valign: "middle",
          halign: "center",
          textColor: [0, 0, 0],
          lineColor: [90, 100, 105],
          lineWidth: 0.35,
          overflow: "linebreak",
        },
        headStyles: {
          fillColor: [216, 235, 238],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          halign: "center",
          valign: "middle",
          minCellHeight: headHeight,
        },
        columnStyles: {
          0: {
            halign: "left",
            cellWidth: escolaW,
            fontStyle: "bold",
            valign: "middle",
            textColor: [0, 0, 0],
          },
          ...Object.fromEntries(
            mapaoColunas.map((_, i) => [
              i + 1,
              {
                cellWidth: midW,
                halign: "center" as const,
                textColor: [0, 0, 0],
              },
            ]),
          ),
          [colCount - 1]: {
            halign: "center",
            cellWidth: normalW,
            fontStyle: "bold",
            fillColor: [216, 235, 238],
            textColor: [0, 0, 0],
          },
        },
        didParseCell(data) {
          data.cell.styles.textColor = [0, 0, 0];
          if (data.section === "body" && data.row.index === body.length - 1) {
            data.cell.styles.fillColor = [216, 235, 238];
            data.cell.styles.fontStyle = "bold";
          } else if (
            data.section === "body" &&
            data.row.index % 2 === 1 &&
            data.column.index < colCount - 1
          ) {
            data.cell.styles.fillColor = [210, 225, 228];
          }
          // Esconde texto horizontal das colunas do meio e TOTAL — desenhamos em pé
          if (
            data.section === "head" &&
            data.column.index > 0
          ) {
            data.cell.text = [];
          }
        },
        didDrawCell(data) {
          if (data.section !== "head" || data.column.index <= 0) {
            return;
          }
          const label =
            data.column.index === colCount - 1
              ? "TOTAL"
              : mapaoColunas[data.column.index - 1];
          if (!label) return;
          const { x, y, width, height } = data.cell;
          doc.setTextColor(0, 0, 0);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(fontSize);
          const textW = doc.getTextWidth(label);
          const cx = x + width / 2;
          const yAnchor = y + (height + textW) / 2;
          doc.text(label, cx, yAnchor, {
            angle: 90,
            align: "left",
          });
        },
        margin: { left: marginX, right: marginX, top: 10, bottom: 10 },
      });

      const stamp = new Date().toISOString().slice(0, 10);
      doc.save(
        `mapao-lotacao-${mapaoDimensao}-${folhaPdf}-${stamp}.pdf`,
      );
      setModalPdfOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao gerar PDF do mapão",
      );
    } finally {
      setExportandoPdf(false);
    }
  }, [
    escolasLotacao,
    mapaoColunas,
    mapaoDimensao,
    mapaoTotaisColuna,
    folhaPdf,
    orientacaoPdf,
  ]);

  const materiasFiltradas = useMemo(() => {
    const items = carencias?.disciplinas ?? [];
    const q = busca.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (d) =>
        d.nome.toLowerCase().includes(q) ||
        d.codigo.toLowerCase().includes(q) ||
        d.escolas.some((e) => e.escola_nome.toLowerCase().includes(q)),
    );
  }, [carencias, busca]);

  const escolasCarencia = useMemo(() => {
    const items = carencias?.escolas ?? [];
    const q = busca.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (e) =>
        e.escola_nome.toLowerCase().includes(q) ||
        e.disciplinas.some(
          (d) =>
            d.nome.toLowerCase().includes(q) ||
            d.codigo.toLowerCase().includes(q),
        ),
    );
  }, [carencias, busca]);

  const showLotacaoSkeleton = aba === "lotacao" && loadingLotacao && !lotacao;
  const showCarenciasSkeleton =
    (aba === "materias" || aba === "escolas") &&
    loadingCarencias &&
    !carencias;

  return (
    <div className="min-w-0 max-w-full">
      <PageHeader
        title="Mapa Estatístico"
        description="Lotação por escola (cargos e funções) e carências em aberto por matéria."
      />
      <ErrorBanner message={error} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            { id: "lotacao" as const, label: "Lotação por escola" },
            { id: "materias" as const, label: "Carências · matéria" },
            { id: "escolas" as const, label: "Carências · escola" },
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

      {showLotacaoSkeleton || showCarenciasSkeleton ? <ContagensSkeleton /> : null}

      {aba === "lotacao" && loadingLotacao && lotacao ? (
        <p className="mb-3 text-xs text-muted">Atualizando mapão...</p>
      ) : null}

      {aba === "lotacao" && lotacao ? (
            <div className="min-w-0 max-w-full">
              <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <StatCard label="Escolas" value={lotacao.escolas.length} />
                <StatCard label="Lotações normais" value={lotacao.normal} />
                <StatCard
                  label={
                    mapaoDimensao === "funcoes"
                      ? "Funções no mapão"
                      : "Cargos no mapão"
                  }
                  value={mapaoColunas.length}
                />
              </div>

              {lotacao.escolas.length === 0 ? (
                <EmptyState message="Nenhuma escola com lotação. Importe professores com o campo escola preenchido." />
              ) : (
                <Panel className="min-w-0 max-w-full overflow-hidden">
                  <div className="mb-4 space-y-3">
                    <Field label="Filtrar escolas">
                      <input
                        className={inputClass}
                        placeholder="Escola, cargo ou função..."
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                      />
                    </Field>
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-2">
                        <p className="text-sm font-medium text-foreground">
                          Mapão geral (somente lotação normal)
                        </p>
                        <p className="text-sm text-muted">
                          Escolas nas linhas ·{" "}
                          {mapaoDimensao === "funcoes" ? "funções" : "cargos"} nas
                          colunas · sem H.E.
                        </p>
                        <div className="flex flex-wrap items-end gap-2">
                          {(
                            [
                              { id: "funcoes" as const, label: "Funções" },
                              { id: "cargos" as const, label: "Cargos" },
                            ] as const
                          ).map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setMapaoDimensao(t.id)}
                              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                                mapaoDimensao === t.id
                                  ? "bg-brand text-white"
                                  : "border border-border bg-white text-foreground hover:bg-brand-soft/40"
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:min-w-[11rem]">
                        <button
                          type="button"
                          className={`${btnSecondary} w-full`}
                          disabled={
                            escolasLotacao.length === 0 ||
                            mapaoColunas.length === 0
                          }
                          onClick={() => setModalPdfOpen(true)}
                        >
                          Baixar PDF
                        </button>
                        <button
                          type="button"
                          className={`w-full rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                            painelColunas
                              ? "bg-brand text-white"
                              : "border border-border bg-white text-foreground hover:bg-brand-soft/40"
                          }`}
                          onClick={() => setPainelColunas((v) => !v)}
                        >
                          Colunas ({mapaoColunas.length}/
                          {mapaoColunasTodas.length})
                        </button>
                      </div>
                    </div>
                  </div>
                  {painelColunas ? (
                    <div className="mb-4 rounded-lg border border-border bg-background/60 p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <p className="text-xs text-muted">
                          Desmarque as colunas que não quer no mapão nem no PDF.
                        </p>
                        <button
                          type="button"
                          className="text-xs font-medium text-brand hover:underline"
                          onClick={selecionarTodasColunas}
                        >
                          Marcar todas
                        </button>
                        <button
                          type="button"
                          className="text-xs font-medium text-brand hover:underline"
                          onClick={ocultarTodasColunas}
                        >
                          Desmarcar todas
                        </button>
                      </div>
                      <input
                        className={`${inputClass} mb-2 text-xs`}
                        placeholder="Buscar coluna..."
                        value={buscaColuna}
                        onChange={(e) => setBuscaColuna(e.target.value)}
                      />
                      <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                        {colunasFiltradasPainel.map((col) => {
                          const marcada = !colunasOcultas.has(col);
                          return (
                            <label
                              key={col}
                              className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-xs hover:bg-brand-soft/30"
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 h-3.5 w-3.5 accent-[var(--color-brand,#1f6b4a)]"
                                checked={marcada}
                                onChange={() => toggleColuna(col)}
                              />
                              <span
                                className={
                                  marcada
                                    ? "text-foreground"
                                    : "text-muted line-through"
                                }
                              >
                                {col}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  {escolasLotacao.length === 0 ? (
                    <EmptyState message="Nenhuma escola encontrada para esse filtro." />
                  ) : (
                    <div className="min-w-0 max-w-full overflow-auto max-h-[min(70vh,40rem)] rounded-lg border-2 border-[#7a868c]">
                      <table className="border-collapse text-left text-xs">
                        <thead>
                          <tr>
                            <th className="sticky left-0 top-0 z-30 w-[11rem] min-w-[11rem] max-w-[11rem] border border-[#7a868c] bg-surface px-2 py-2 text-left align-middle font-medium text-muted">
                              Escola
                            </th>
                            {mapaoColunas.map((col) => (
                              <th
                                key={col}
                                className="sticky top-0 z-20 w-9 min-w-9 max-w-9 border border-[#7a868c] bg-surface p-1 align-middle"
                                title={col}
                              >
                                <div className="flex h-36 w-full items-center justify-center">
                                  <span
                                    className="max-h-36 overflow-hidden whitespace-nowrap text-center text-[10px] font-medium leading-snug text-muted"
                                    style={{
                                      writingMode: "vertical-rl",
                                      transform: "rotate(180deg)",
                                    }}
                                  >
                                    {col}
                                  </span>
                                </div>
                              </th>
                            ))}
                            <th className="sticky top-0 z-20 w-9 min-w-9 max-w-9 border border-[#7a868c] bg-brand-soft p-1 align-middle">
                              <div className="flex h-36 w-full items-center justify-center">
                                <span
                                  className="max-h-36 overflow-hidden whitespace-nowrap text-center text-[10px] font-semibold leading-snug text-brand-dark"
                                  style={{
                                    writingMode: "vertical-rl",
                                    transform: "rotate(180deg)",
                                  }}
                                >
                                  TOTAL
                                </span>
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {escolasLotacao.map((e, rowIdx) => {
                            const itens =
                              mapaoDimensao === "funcoes"
                                ? e.funcoes
                                : e.cargos;
                            const byNome = new Map(
                              itens.map((i) => [i.nome, i.normal]),
                            );
                            const rowNormal = mapaoColunas.reduce(
                              (acc, col) => acc + (byNome.get(col) ?? 0),
                              0,
                            );
                            const zebra =
                              rowIdx % 2 === 1
                                ? "bg-[#d2e4e8]"
                                : "bg-surface";
                            return (
                              <tr key={e.nome} className="hover:bg-brand-soft/60">
                                <td
                                  className={`sticky left-0 z-10 w-[11rem] min-w-[11rem] max-w-[11rem] truncate border border-[#7a868c] px-2 py-1.5 font-medium ${zebra}`}
                                  title={e.nome}
                                >
                                  {e.nome}
                                </td>
                                {mapaoColunas.map((col) => {
                                  const v = byNome.get(col) ?? 0;
                                  return (
                                    <td
                                      key={col}
                                      className={`border border-[#7a868c] px-0.5 py-1.5 text-center tabular-nums ${zebra} ${
                                        v === 0
                                          ? "text-muted/40"
                                          : "text-foreground"
                                      }`}
                                    >
                                      {v || "·"}
                                    </td>
                                  );
                                })}
                                <td className="border border-[#7a868c] bg-brand-soft px-0.5 py-1.5 text-center tabular-nums font-semibold">
                                  {rowNormal}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td className="sticky bottom-0 left-0 z-30 border border-[#7a868c] bg-brand-soft px-2 py-2 font-semibold text-brand-dark">
                              Total
                            </td>
                            {mapaoColunas.map((col) => (
                              <td
                                key={col}
                                className="sticky bottom-0 z-20 border border-[#7a868c] bg-brand-soft px-0.5 py-2 text-center tabular-nums font-semibold"
                              >
                                {mapaoTotaisColuna.porColuna.get(col) ?? 0}
                              </td>
                            ))}
                            <td className="sticky bottom-0 z-20 border border-[#7a868c] bg-brand-soft px-0.5 py-2 text-center tabular-nums font-semibold text-brand-dark">
                              {mapaoTotaisColuna.normal}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </Panel>
              )}
            </div>
          ) : null}

          {aba === "materias" && carencias ? (
            <>
              <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <StatCard
                  label="Tempos em aberto"
                  value={carencias.total_abertos}
                />
                <StatCard
                  label="Matérias com carência"
                  value={carencias.disciplinas.length}
                />
                <StatCard
                  label="Escolas com carência"
                  value={carencias.escolas.length}
                />
              </div>

              {carencias.total_abertos === 0 ? (
                <EmptyState message="Nenhuma carência em aberto nas escolas da lista." />
              ) : (
                <Panel>
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <p className="text-sm text-muted">
                      Clique na matéria para ver o detalhe por escola.
                    </p>
                    <div className="w-full max-w-xs">
                      <Field label="Filtrar">
                        <input
                          className={inputClass}
                          placeholder="Matéria, código ou escola..."
                          value={busca}
                          onChange={(e) => setBusca(e.target.value)}
                        />
                      </Field>
                    </div>
                  </div>

                  {materiasFiltradas.length === 0 ? (
                    <EmptyState message="Nenhuma matéria encontrada para esse filtro." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-border text-xs text-muted">
                            <th className="pb-2 pr-3 font-medium">Código</th>
                            <th className="pb-2 pr-3 font-medium">Matéria</th>
                            <th className="pb-2 pr-3 font-medium text-right">
                              Carências
                            </th>
                            <th className="pb-2 font-medium text-right">
                              Escolas
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {materiasFiltradas.map((d) => {
                            const key =
                              d.disciplina_id || `${d.codigo}|${d.nome}`;
                            const open = expandida === key;
                            return (
                              <Fragment key={key}>
                                <tr
                                  className="cursor-pointer hover:bg-brand-soft/30"
                                  onClick={() =>
                                    setExpandida(open ? null : key)
                                  }
                                >
                                  <td className="py-2.5 pr-3 font-medium text-brand">
                                    {d.codigo}
                                  </td>
                                  <td className="py-2.5 pr-3 font-medium">
                                    {d.nome}
                                  </td>
                                  <td className="py-2.5 pr-3 text-right tabular-nums font-semibold">
                                    {d.abertos}
                                  </td>
                                  <td className="py-2.5 text-right tabular-nums text-muted">
                                    {d.escolas.length}
                                  </td>
                                </tr>
                                {open
                                  ? d.escolas.map((e) => (
                                      <tr
                                        key={`${key}-${e.escola_id}`}
                                        className="bg-background/50"
                                      >
                                        <td className="py-2 pr-3" />
                                        <td className="py-2 pr-3 text-muted">
                                          <Link
                                            to={`/carencias/doc1/${e.escola_id}`}
                                            className="text-brand hover:underline"
                                            onClick={(ev) =>
                                              ev.stopPropagation()
                                            }
                                          >
                                            {e.escola_nome}
                                          </Link>
                                        </td>
                                        <td className="py-2 pr-3 text-right tabular-nums text-muted">
                                          {e.abertos}
                                        </td>
                                        <td className="py-2" />
                                      </tr>
                                    ))
                                  : null}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              )}
            </>
          ) : null}

          {aba === "escolas" && carencias ? (
            <>
              <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <StatCard
                  label="Tempos em aberto"
                  value={carencias.total_abertos}
                />
                <StatCard
                  label="Matérias com carência"
                  value={carencias.disciplinas.length}
                />
                <StatCard
                  label="Escolas com carência"
                  value={carencias.escolas.length}
                />
              </div>

              {carencias.total_abertos === 0 ? (
                <EmptyState message="Nenhuma carência em aberto nas escolas da lista." />
              ) : (
                <Panel>
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <p className="text-sm text-muted">
                      Clique na escola para ver o detalhe por matéria.
                    </p>
                    <div className="w-full max-w-xs">
                      <Field label="Filtrar">
                        <input
                          className={inputClass}
                          placeholder="Escola, matéria ou código..."
                          value={busca}
                          onChange={(e) => setBusca(e.target.value)}
                        />
                      </Field>
                    </div>
                  </div>

                  {escolasCarencia.length === 0 ? (
                    <EmptyState message="Nenhuma escola encontrada para esse filtro." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-border text-xs text-muted">
                            <th className="pb-2 pr-3 font-medium">Escola</th>
                            <th className="pb-2 pr-3 font-medium text-right">
                              Carências
                            </th>
                            <th className="pb-2 font-medium text-right">
                              Matérias
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {escolasCarencia.map((e) => {
                            const open = expandida === e.escola_id;
                            return (
                              <Fragment key={e.escola_id}>
                                <tr
                                  className="cursor-pointer hover:bg-brand-soft/30"
                                  onClick={() =>
                                    setExpandida(open ? null : e.escola_id)
                                  }
                                >
                                  <td className="py-2.5 pr-3 font-medium">
                                    <Link
                                      to={`/carencias/doc1/${e.escola_id}`}
                                      className="text-brand hover:underline"
                                      onClick={(ev) => ev.stopPropagation()}
                                    >
                                      {e.escola_nome}
                                    </Link>
                                  </td>
                                  <td className="py-2.5 pr-3 text-right tabular-nums font-semibold">
                                    {e.abertos}
                                  </td>
                                  <td className="py-2.5 text-right tabular-nums text-muted">
                                    {e.disciplinas.length}
                                  </td>
                                </tr>
                                {open
                                  ? e.disciplinas.map((d) => (
                                      <tr
                                        key={`${e.escola_id}-${d.disciplina_id || d.codigo}`}
                                        className="bg-background/50"
                                      >
                                        <td className="py-2 pr-3 text-muted">
                                          {d.codigo !== "—" ? (
                                            <span className="text-brand">
                                              {d.codigo}
                                            </span>
                                          ) : null}
                                          {d.codigo !== "—" ? " · " : null}
                                          {d.nome}
                                        </td>
                                        <td className="py-2 pr-3 text-right tabular-nums text-muted">
                                          {d.abertos}
                                        </td>
                                        <td className="py-2" />
                                      </tr>
                                    ))
                                  : null}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              )}
            </>
          ) : null}

      <Modal
        open={modalPdfOpen}
        title="Baixar mapão em PDF"
        onClose={() => {
          if (!exportandoPdf) setModalPdfOpen(false);
        }}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Escolha o tamanho da folha e a orientação antes de gerar o arquivo.
            Serão usadas as {mapaoColunas.length} coluna(s) marcadas no mapão.
          </p>
          <Field label="Folha">
            <select
              className={inputClass}
              value={folhaPdf}
              onChange={(e) => setFolhaPdf(e.target.value as FolhaPdf)}
            >
              {FOLHAS_PDF.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Orientação">
            <select
              className={inputClass}
              value={orientacaoPdf}
              onChange={(e) =>
                setOrientacaoPdf(e.target.value as OrientacaoPdf)
              }
            >
              <option value="landscape">Paisagem</option>
              <option value="portrait">Retrato</option>
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className={btnSecondary}
              disabled={exportandoPdf}
              onClick={() => setModalPdfOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={exportandoPdf || mapaoColunas.length === 0}
              onClick={baixarMapaoPdf}
            >
              {exportandoPdf ? "Gerando..." : "Gerar PDF"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ContagensSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Carregando">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-20 rounded-lg border border-border bg-brand-soft/40"
          />
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="space-y-2 p-4">
          <div className="h-4 w-48 rounded bg-brand-soft/50" />
          <div className="h-3 w-72 rounded bg-border/80" />
        </div>
        <div className="space-y-1 px-4 pb-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex gap-2">
              <div className="h-8 w-40 shrink-0 rounded bg-brand-soft/40" />
              <div className="h-8 flex-1 rounded bg-border/50" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
