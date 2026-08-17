import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import {
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  IconDeleteButton,
  PageHeader,
  Panel,
  btnPrimary,
  btnSecondary,
  inputClass,
} from "@/components/ui";
import { api } from "@/lib/api";
import {
  DIAS,
  PERIODOS,
  TURNO_HEADER,
  TURNO_LABEL,
  type Disciplina,
  type Escola,
  type Quadro,
  type Turno,
} from "@/lib/types";

type SortKey = "turma" | "turno" | "disciplina" | "tempos" | "abertos";
type SortDir = "asc" | "desc" | null;

const TURNO_ORDER: Record<Turno, number> = {
  MANHA: 1,
  TARDE: 2,
  NOITE: 3,
};

const SORT_COLS: { key: SortKey; label: string }[] = [
  { key: "turma", label: "Turma" },
  { key: "turno", label: "Turno" },
  { key: "disciplina", label: "Disciplina" },
  { key: "tempos", label: "Tempos" },
  { key: "abertos", label: "Em aberto" },
];

function SortMark({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active || !dir) {
    return (
      <span
        className="ml-1 inline-block w-3 text-center text-muted/50"
        aria-hidden
      >
        –
      </span>
    );
  }
  return (
    <span className="ml-1 inline-block w-3 text-center text-brand" aria-hidden>
      {dir === "asc" ? "▲" : "▼"}
    </span>
  );
}

function MiniGrade({ quadro }: { quadro: Quadro }) {
  const map = useMemo(() => {
    const m = new Map<
      string,
      {
        matricula: string | null;
        tipo: string | null;
        modalidade_cobertura: string | null;
        titular_matricula: string | null;
      }
    >();
    for (const s of quadro.slots_preview ?? []) {
      m.set(`${s.dia}:${s.periodo}`, {
        matricula: s.matricula,
        tipo: s.tipo ?? "REAL",
        modalidade_cobertura: s.modalidade_cobertura ?? null,
        titular_matricula: s.titular_matricula ?? null,
      });
    }
    return m;
  }, [quadro.slots_preview]);

  return (
    <div className="overflow-hidden rounded-md border border-border bg-white">
      <div
        className={`px-2 py-1 text-center text-[10px] font-bold tracking-wide ${TURNO_HEADER[quadro.turno]}`}
      >
        {(quadro.turmas && quadro.turmas.length > 0
          ? quadro.turmas
          : [quadro.turma_codigo]
        ).join(" · ")}
      </div>
      <table className="w-full border-collapse text-[8px] leading-none">
        <thead>
          <tr>
            <th className="w-3 border-b border-border bg-slate-50 p-0.5" />
            {DIAS.map((d) => (
              <th
                key={d.id}
                className="border-b border-l border-border bg-slate-50 p-0.5 font-medium text-muted"
              >
                {d.label.slice(0, 1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIODOS.map((periodo) => (
            <tr key={periodo}>
              <td className="border-t border-border bg-slate-50 p-0.5 text-center text-muted">
                {periodo}
              </td>
              {DIAS.map((d) => {
                const slot = map.get(`${d.id}:${periodo}`);
                const coberta = !!slot?.matricula;
                const emLicenca = !!slot?.titular_matricula;
                const temporaria = slot?.tipo === "TEMPORARIA";
                const isHoraNormal = slot?.modalidade_cobertura === "NORMAL";
                let cellClass = "bg-white";
                let titulo = "Vazio";
                if (slot) {
                  if (emLicenca && !coberta) {
                    cellClass = "bg-fuchsia-200";
                    titulo = "Licença em aberto";
                  } else if (coberta && temporaria && isHoraNormal) {
                    cellClass = "bg-amber-200";
                    titulo = emLicenca
                      ? "Licença · substituto (Hora Normal)"
                      : "Temporária · Hora Normal";
                  } else if (coberta && temporaria) {
                    cellClass = "bg-orange-200";
                    titulo = emLicenca
                      ? "Licença · substituto (Hora Extra)"
                      : "Temporária · Hora Extra";
                  } else if (coberta && isHoraNormal) {
                    cellClass = "bg-teal-200";
                    titulo = "Real · Hora Normal";
                  } else if (coberta) {
                    cellClass = "bg-emerald-200";
                    titulo = "Real · Hora Extra";
                  } else if (temporaria) {
                    cellClass = "bg-rose-200";
                    titulo = "Temporária em aberto";
                  } else {
                    cellClass = "bg-sky-200";
                    titulo = "Real em aberto";
                  }
                }
                return (
                  <td
                    key={d.id}
                    className={`h-3.5 border-l border-t border-border p-0 ${cellClass}`}
                    title={titulo}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EscolaQuadrosPage() {
  const { escolaId } = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const voltarLista =
    (location.state as { from?: string } | null)?.from ?? "/carencias/doc1";
  const profFiltro = searchParams.get("prof");
  const disciplinaFiltro = searchParams.get("disciplina");
  const quadrosFiltro = searchParams.get("quadros")?.split(",").filter(Boolean) ?? [];
  const temFiltroProf = !!(profFiltro && quadrosFiltro.length > 0);
  const temFiltroDisc = !!(disciplinaFiltro || (quadrosFiltro.length > 0 && !profFiltro));
  const temFiltro = temFiltroProf || temFiltroDisc;

  const [escola, setEscola] = useState<Escola | null>(null);
  const [quadros, setQuadros] = useState<Quadro[]>([]);
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [turmas, setTurmas] = useState<string[]>([]);
  const [turmaInput, setTurmaInput] = useState("");
  const [turno, setTurno] = useState<Turno>("MANHA");
  const [disciplinaId, setDisciplinaId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Quadro | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingQuadro, setEditingQuadro] = useState<Quadro | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [mesclando, setMesclando] = useState(false);
  const [erroMesclaApi, setErroMesclaApi] = useState<string | null>(null);
  const [professorNome, setProfessorNome] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!escolaId) return;
    try {
      const [data, discs] = await Promise.all([
        api<{ escola: Escola; quadros: Quadro[] }>(
          `/escolas/${escolaId}/quadros`,
        ),
        api<Disciplina[]>("/disciplinas"),
      ]);
      setEscola(data.escola);
      setQuadros(data.quadros);
      setDisciplinas(discs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    }
  }, [escolaId]);

  useEffect(() => {
    if (profFiltro) {
      api<{ nome: string }>(`/professores/${profFiltro}`)
        .then((p) => setProfessorNome(p.nome))
        .catch(() => setProfessorNome(null));
    } else {
      setProfessorNome(null);
    }
  }, [profFiltro]);

  useEffect(() => {
    void load();
  }, [load]);

  const quadrosOrdenados = useMemo(() => {
    let lista = quadros;
    if (quadrosFiltro.length > 0) {
      lista = lista.filter((q) => quadrosFiltro.includes(q.id));
    } else if (disciplinaFiltro) {
      lista = lista.filter((q) => q.disciplina_id === disciplinaFiltro);
    }
    if (!sortKey || !sortDir) return lista;

    const fator = sortDir === "asc" ? 1 : -1;
    return [...lista].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "turma":
          cmp = a.turma_codigo.localeCompare(b.turma_codigo, "pt-BR");
          break;
        case "turno":
          cmp = TURNO_ORDER[a.turno] - TURNO_ORDER[b.turno];
          break;
        case "disciplina":
          cmp = (a.disciplina_codigo ?? "").localeCompare(
            b.disciplina_codigo ?? "",
            "pt-BR",
          );
          break;
        case "tempos":
          cmp = (a.total_slots ?? 0) - (b.total_slots ?? 0);
          break;
        case "abertos":
          cmp = (a.slots_abertos ?? 0) - (b.slots_abertos ?? 0);
          break;
      }
      return cmp * fator;
    });
  }, [quadros, sortKey, sortDir, quadrosFiltro, disciplinaFiltro]);

  /** Quando há vários quadros iguais (turma+turno+disciplina), mostra #1, #2… */
  const indiceDuplicata = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const q of quadros) {
      const key = `${q.turma_codigo}|${q.turno}|${q.disciplina_id ?? ""}`;
      const list = groups.get(key) ?? [];
      list.push(q.id);
      groups.set(key, list);
    }
    const map = new Map<string, number>();
    for (const ids of groups.values()) {
      if (ids.length < 2) continue;
      ids.forEach((id, i) => map.set(id, i + 1));
    }
    return map;
  }, [quadros]);

  function alternarOrdenacao(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    if (sortDir === "asc") {
      setSortDir("desc");
      return;
    }
    setSortKey(null);
    setSortDir(null);
  }

  function abrirModal() {
    setEditingQuadro(null);
    setTurmas([]);
    setTurmaInput("");
    setTurno("MANHA");
    setDisciplinaId("");
    setFormError(null);
    setModalAberto(true);
  }

  function abrirModalEditar(quadro: Quadro) {
    setEditingQuadro(quadro);
    setTurmas(quadro.turmas && quadro.turmas.length > 0 ? [...quadro.turmas] : [quadro.turma_codigo]);
    setTurmaInput("");
    setTurno(quadro.turno);
    setDisciplinaId(quadro.disciplina_id ?? "");
    setFormError(null);
    setModalAberto(true);
  }

  function fecharModal() {
    if (loading) return;
    setModalAberto(false);
    setEditingQuadro(null);
    setFormError(null);
  }

  function adicionarTurmasDoTexto(texto: string) {
    const parts = texto
      .split(/[,;\s]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setTurmas((prev) => {
      const set = new Set(prev.map((t) => t.toUpperCase()));
      const next = [...prev];
      for (const p of parts) {
        const key = p.toUpperCase();
        if (set.has(key)) continue;
        set.add(key);
        next.push(p);
      }
      return next;
    });
    setTurmaInput("");
  }

  function removerTurma(codigo: string) {
    setTurmas((prev) => prev.filter((t) => t !== codigo));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!escolaId) return;

    const lista = [...turmas];
    const pending = turmaInput.trim();
    if (pending) {
      for (const p of pending.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean)) {
        if (!lista.some((t) => t.toUpperCase() === p.toUpperCase())) {
          lista.push(p);
        }
      }
    }

    if (lista.length === 0) {
      setFormError("Informe ao menos uma turma.");
      return;
    }

    setLoading(true);
    setFormError(null);
    try {
      if (editingQuadro) {
        await api(`/quadros/${editingQuadro.id}`, {
          method: "PUT",
          body: JSON.stringify({
            turmas: lista,
            turno,
            disciplina_id: disciplinaId || null,
          }),
        });
      } else {
        await api(`/escolas/${escolaId}/quadros/lote`, {
          method: "POST",
          body: JSON.stringify({
            turmas: lista,
            turno,
            disciplina_id: disciplinaId || null,
          }),
        });
      }
      setModalAberto(false);
      setEditingQuadro(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : editingQuadro ? "Erro ao salvar quadro" : "Erro ao criar quadro");
    } finally {
      setLoading(false);
    }
  }

  async function confirmarExclusao() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api(`/quadros/${pendingDelete.id}`, { method: "DELETE" });
      setPendingDelete(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir");
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  function toggleSelecionado(id: string) {
    setErroMesclaApi(null);
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const quadrosSelecionados = useMemo(
    () => quadros.filter((q) => selecionados.has(q.id)),
    [quadros, selecionados],
  );

  const podeMesclar = quadrosSelecionados.length >= 2;

  const erroMescla = useMemo(() => {
    if (quadrosSelecionados.length < 2) return null;
    const turnos = new Set(quadrosSelecionados.map((q) => q.turno));
    if (turnos.size > 1) {
      return "Não é possível mesclar quadros de turnos diferentes.";
    }
    const disciplinas = new Set(quadrosSelecionados.map((q) => q.disciplina_id ?? ""));
    if (disciplinas.size > 1) {
      return "Não é possível mesclar quadros de disciplinas diferentes.";
    }
    return null;
  }, [quadrosSelecionados]);

  async function mesclarQuadros() {
    if (!podeMesclar || erroMescla) return;
    setMesclando(true);
    setErroMesclaApi(null);
    try {
      await api("/quadros/mesclar", {
        method: "POST",
        body: JSON.stringify({ quadro_ids: [...selecionados] }),
      });
      setSelecionados(new Set());
      await load();
    } catch (err) {
      setErroMesclaApi(err instanceof Error ? err.message : "Erro ao mesclar quadros");
    } finally {
      setMesclando(false);
    }
  }

  if (!escola && !error) {
    return <p className="text-sm text-muted">Carregando...</p>;
  }

  return (
    <div>
      <PageHeader
        title={escola?.nome ?? "Escola"}
        description="Cada card é um quadro de carência. Pode criar vários da mesma turma e também juntar turmas num só quadro."
        actions={
          <>
            <button type="button" className={btnPrimary} onClick={abrirModal}>
              Novo quadro
            </button>
            <Link to={voltarLista} className={btnSecondary}>
              Voltar
            </Link>
          </>
        }
      />
      <ErrorBanner message={error} />

      {temFiltro && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-brand bg-brand-soft/30 px-4 py-3">
          <svg className="h-5 w-5 flex-shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="text-sm">
            Mostrando <strong className="text-brand">{quadrosOrdenados.length} quadro(s)</strong>
            {professorNome && (
              <>
                {" "}onde <strong className="text-brand">{professorNome}</strong> está alocado
              </>
            )}
            {temFiltroDisc && !professorNome && (
              <> filtrados pela disciplina</>
            )}
            {" "}(de {quadros.length} total)
          </span>
          <button
            type="button"
            className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white transition hover:bg-brand-dark"
            onClick={() => setSearchParams({})}
          >
            Limpar filtro
          </button>
        </div>
      )}

      {quadros.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-muted">Ordenar:</span>
          {SORT_COLS.map((col) => {
            const ativo = sortKey === col.key;
            return (
              <button
                key={col.key}
                type="button"
                className="inline-flex items-center rounded-md border border-border bg-surface px-2 py-1 text-xs transition hover:bg-brand-soft/50"
                onClick={() => alternarOrdenacao(col.key)}
              >
                {col.label}
                <SortMark active={ativo} dir={ativo ? sortDir : null} />
              </button>
            );
          })}
          <span className="ml-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-200" />
              Real aberto
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-200" />
              Temp. aberto
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-200" />
              Real·HE
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-teal-200" />
              Real·Normal
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-orange-200" />
              Temp·HE
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-200" />
              Temp·Normal
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-fuchsia-200" />
              Licença
            </span>
          </span>
        </div>
      ) : null}

      {quadros.length === 0 ? (
        <Panel>
          <EmptyState message="Nenhum quadro ainda. Clique em “Novo quadro” para criar o primeiro." />
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {quadrosOrdenados.map((q) => {
            const selecionado = selecionados.has(q.id);
            const dup = indiceDuplicata.get(q.id);
            return (
              <Panel
                key={q.id}
                className={`flex flex-col gap-3 transition-shadow ${
                  selecionado ? "ring-2 ring-brand" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <label className="mt-1 flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer rounded border-border text-brand focus:ring-brand"
                      checked={selecionado}
                      onChange={() => toggleSelecionado(q.id)}
                    />
                  </label>
                  <div className="flex flex-1 items-start justify-between gap-2">
                    <div>
                      <h2 className="font-display text-lg font-semibold text-brand-dark">
                        {(q.turmas && q.turmas.length > 0
                          ? q.turmas
                          : [q.turma_codigo]
                        ).join(" · ")}
                        {dup != null ? (
                          <span className="ml-1.5 text-sm font-medium text-muted">
                            #{dup}
                          </span>
                        ) : null}
                      </h2>
                      <p className="text-sm text-muted">
                        {TURNO_LABEL[q.turno]}
                        {q.disciplina_codigo ? ` · ${q.disciplina_codigo}` : ""}
                        {(q.turmas?.length ?? 0) > 1
                          ? ` · ${q.turmas!.length} turmas`
                          : ""}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted">
                      <p>
                        <span className="font-semibold text-foreground">
                          {q.total_slots ?? 0}
                        </span>{" "}
                        tempos
                      </p>
                      <p className="text-warn">
                        {q.slots_abertos ?? 0} em aberto
                      </p>
                    </div>
                  </div>
                </div>

                <MiniGrade quadro={q} />

                <div className="mt-auto flex items-center gap-2 pt-1">
                  <Link
                    to={`/carencias/doc1/${escolaId}/${q.id}`}
                    state={{ from: `${location.pathname}${location.search}` }}
                    className={`${btnPrimary} flex-1`}
                  >
                    Abrir
                  </Link>
                  <button
                    type="button"
                    className="rounded-md p-2 text-muted transition hover:bg-brand-soft hover:text-brand"
                    title="Editar quadro"
                    aria-label={`Editar quadro ${q.turma_codigo}`}
                    onClick={() => abrirModalEditar(q)}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                    </svg>
                  </button>
                  <IconDeleteButton
                    label={`Excluir quadro ${q.turma_codigo}`}
                    onClick={() => setPendingDelete(q)}
                  />
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {modalAberto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={fecharModal}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-novo-quadro-titulo"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2
                id="modal-novo-quadro-titulo"
                className="font-display text-xl font-semibold text-brand-dark"
              >
                {editingQuadro ? "Editar quadro" : "Novo quadro de carência"}
              </h2>
              <button
                type="button"
                className={btnSecondary}
                onClick={fecharModal}
                disabled={loading}
              >
                Fechar
              </button>
            </div>

            <ErrorBanner message={formError} />

            <form onSubmit={onSubmit} className="space-y-3">
              <Field label="Turmas">
                <div className="rounded-lg border border-border bg-white px-2 py-2 focus-within:ring-2 focus-within:ring-brand/30">
                  {turmas.length > 0 ? (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {turmas.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-2 py-1 text-xs font-semibold text-brand-dark"
                        >
                          {t}
                          <button
                            type="button"
                            className="rounded text-brand hover:text-danger"
                            aria-label={`Remover turma ${t}`}
                            onClick={() => removerTurma(t)}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <input
                    className="w-full bg-transparent text-sm outline-none"
                    autoFocus
                    value={turmaInput}
                    placeholder={
                      turmas.length === 0
                        ? "ex: 611 612 613 — Enter ou vírgula para adicionar"
                        : "Mais uma turma…"
                    }
                    onChange={(e) => setTurmaInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "," || e.key === ";") {
                        e.preventDefault();
                        adicionarTurmasDoTexto(turmaInput);
                      }
                      if (
                        e.key === "Backspace" &&
                        !turmaInput &&
                        turmas.length > 0
                      ) {
                        removerTurma(turmas[turmas.length - 1]!);
                      }
                    }}
                    onBlur={() => {
                      if (turmaInput.trim()) adicionarTurmasDoTexto(turmaInput);
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted">
                  Todas entram no mesmo quadro. Na grade você escolhe qual turma
                  marcar em cada horário.
                </p>
              </Field>
              <Field label="Turno">
                <select
                  className={inputClass}
                  value={turno}
                  onChange={(e) => setTurno(e.target.value as Turno)}
                >
                  <option value="MANHA">Manhã</option>
                  <option value="TARDE">Tarde</option>
                  <option value="NOITE">Noite</option>
                </select>
              </Field>
              <Field label="Disciplina">
                <select
                  className={inputClass}
                  value={disciplinaId}
                  onChange={(e) => setDisciplinaId(e.target.value)}
                >
                  <option value="">—</option>
                  {disciplinas.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.codigo} — {d.nome}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted">
                  Pode criar mais de um quadro com as mesmas turmas, turno e
                  disciplina (ex.: dois quadros da 611 Manhã · PT).
                </p>
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
                  {loading
                    ? editingQuadro ? "Salvando..." : "Criando..."
                    : editingQuadro ? "Salvar" : "Criar quadro"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!pendingDelete}
        message={
          pendingDelete
            ? `Excluir o quadro da turma ${pendingDelete.turma_codigo} e todos os horários?`
            : ""
        }
        loading={deleting}
        onConfirm={() => void confirmarExclusao()}
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
      />

      {/* Barra flutuante de seleção */}
      {selecionados.size > 0 && (
        <div className="pointer-events-none fixed inset-x-3 bottom-5 z-50 flex justify-center lg:left-[calc(var(--app-sidebar,16rem)+1.5rem)] lg:right-6">
          <div className="pointer-events-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-surface/95 text-foreground shadow-[0_12px_40px_-16px_rgba(28,42,51,0.35)] backdrop-blur-md">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-brand px-2.5 text-sm font-semibold tabular-nums text-white">
                  {selecionados.size}
                </span>
                <div>
                  <p className="text-sm font-medium leading-none text-brand-dark">
                    quadro{selecionados.size === 1 ? "" : "s"} selecionado
                    {selecionados.size === 1 ? "" : "s"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {erroMescla ?? erroMesclaApi ?? "Selecione 2+ para mesclar"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {podeMesclar && !erroMescla && (
                  <button
                    type="button"
                    className="h-8 cursor-pointer rounded-lg bg-brand px-4 text-xs font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={mesclando}
                    onClick={() => void mesclarQuadros()}
                  >
                    {mesclando ? "Mesclando..." : "Mesclar"}
                  </button>
                )}
                <button
                  type="button"
                  className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-brand-soft/60 hover:text-brand-dark"
                  onClick={() => setSelecionados(new Set())}
                >
                  Limpar
                </button>
              </div>
            </div>
            {(erroMescla || erroMesclaApi) && (
              <div className="border-t border-danger/20 bg-red-50 px-4 py-2 text-xs text-danger">
                {erroMescla || erroMesclaApi}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
