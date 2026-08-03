import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
    const m = new Map<string, { matricula: string | null }>();
    for (const s of quadro.slots_preview ?? []) {
      m.set(`${s.dia}:${s.periodo}`, { matricula: s.matricula });
    }
    return m;
  }, [quadro.slots_preview]);

  return (
    <div className="overflow-hidden rounded-md border border-border bg-white">
      <div
        className={`px-2 py-1 text-center text-[10px] font-bold tracking-wide ${TURNO_HEADER[quadro.turno]}`}
      >
        {quadro.turma_codigo}
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
                return (
                  <td
                    key={d.id}
                    className={`h-3.5 border-l border-t border-border p-0 ${
                      !slot
                        ? "bg-white"
                        : slot.matricula
                          ? "bg-emerald-400/80"
                          : "bg-sky-300/80"
                    }`}
                    title={
                      !slot
                        ? "Vazio"
                        : slot.matricula
                          ? "Com professor"
                          : "Carência aberta"
                    }
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
  const [escola, setEscola] = useState<Escola | null>(null);
  const [quadros, setQuadros] = useState<Quadro[]>([]);
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [turma, setTurma] = useState("");
  const [turno, setTurno] = useState<Turno>("MANHA");
  const [disciplinaId, setDisciplinaId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Quadro | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

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
    void load();
  }, [load]);

  const quadrosOrdenados = useMemo(() => {
    if (!sortKey || !sortDir) return quadros;

    const fator = sortDir === "asc" ? 1 : -1;
    return [...quadros].sort((a, b) => {
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
  }, [quadros, sortKey, sortDir]);

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
    setTurma("");
    setTurno("MANHA");
    setDisciplinaId("");
    setFormError(null);
    setModalAberto(true);
  }

  function fecharModal() {
    if (loading) return;
    setModalAberto(false);
    setFormError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!escolaId) return;
    setLoading(true);
    setFormError(null);
    try {
      await api(`/escolas/${escolaId}/quadros`, {
        method: "POST",
        body: JSON.stringify({
          turma_codigo: turma.trim(),
          turno,
          disciplina_id: disciplinaId || null,
        }),
      });
      setModalAberto(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao criar quadro");
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

  if (!escola && !error) {
    return <p className="text-sm text-muted">Carregando...</p>;
  }

  return (
    <div>
      <PageHeader
        title={escola?.nome ?? "Escola"}
        description="Cada card é um quadro de turma, com miniatura dos horários preenchidos."
        actions={
          <>
            <button type="button" className={btnPrimary} onClick={abrirModal}>
              Novo quadro
            </button>
            <Link to="/carencias" className={btnSecondary}>
              Voltar
            </Link>
          </>
        }
      />
      <ErrorBanner message={error} />

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
          <span className="ml-2 text-[11px] text-muted">
            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-sky-300/80 align-middle" />
            aberto
            <span className="ml-3 mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-400/80 align-middle" />
            com professor
          </span>
        </div>
      ) : null}

      {quadros.length === 0 ? (
        <Panel>
          <EmptyState message="Nenhum quadro ainda. Clique em “Novo quadro” para criar o primeiro." />
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {quadrosOrdenados.map((q) => (
            <Panel key={q.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-semibold text-brand-dark">
                    {q.turma_codigo}
                  </h2>
                  <p className="text-sm text-muted">
                    {TURNO_LABEL[q.turno]}
                    {q.disciplina_codigo ? ` · ${q.disciplina_codigo}` : ""}
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

              <MiniGrade quadro={q} />

              <div className="mt-auto flex items-center gap-2 pt-1">
                <Link
                  to={`/carencias/${escolaId}/${q.id}`}
                  className={`${btnPrimary} flex-1`}
                >
                  Abrir
                </Link>
                <IconDeleteButton
                  label={`Excluir quadro ${q.turma_codigo}`}
                  onClick={() => setPendingDelete(q)}
                />
              </div>
            </Panel>
          ))}
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
                Novo quadro (turma)
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
              <Field label="Código da turma">
                <input
                  className={inputClass}
                  required
                  autoFocus
                  value={turma}
                  placeholder="ex: 914-PT"
                  onChange={(e) => setTurma(e.target.value)}
                />
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
              <Field label="Disciplina (opcional)">
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
                  {loading ? "Criando..." : "Criar quadro"}
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
    </div>
  );
}
