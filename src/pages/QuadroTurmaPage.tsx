import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ErrorBanner,
  PageHeader,
  Panel,
  btnSecondary,
} from "@/components/ui";
import { api } from "@/lib/api";
import {
  DIAS,
  PERIODOS,
  TIPO_CARENCIA_LABEL,
  TURNO_HEADER,
  TURNO_LABEL,
  type Professor,
  type Quadro,
  type QuadroSlot,
  type TipoCarencia,
  type Turno,
} from "@/lib/types";

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDataBR(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function carenciaExpirada(slot: QuadroSlot) {
  return (
    slot.tipo === "TEMPORARIA" &&
    !!slot.expira_em &&
    slot.expira_em < hojeISO()
  );
}

type QuadroData = { quadro: Quadro; slots: QuadroSlot[] };

type CellPos = { dia: number; periodo: number };

function posKey(p: CellPos) {
  return `${p.dia}:${p.periodo}`;
}

function parseKey(key: string): CellPos {
  const [dia, periodo] = key.split(":").map(Number);
  return { dia, periodo };
}

function rangeKeys(a: CellPos, b: CellPos): string[] {
  const diaMin = Math.min(a.dia, b.dia);
  const diaMax = Math.max(a.dia, b.dia);
  const perMin = Math.min(a.periodo, b.periodo);
  const perMax = Math.max(a.periodo, b.periodo);
  const keys: string[] = [];
  for (let periodo = perMin; periodo <= perMax; periodo++) {
    for (let dia = diaMin; dia <= diaMax; dia++) {
      keys.push(posKey({ dia, periodo }));
    }
  }
  return keys;
}

export function QuadroTurmaPage() {
  const { escolaId, quadroId } = useParams();
  const [data, setData] = useState<QuadroData | null>(null);
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [professorSel, setProfessorSel] = useState("");
  const [tipoCarencia, setTipoCarencia] = useState<TipoCarencia>("REAL");
  const [expiraEm, setExpiraEm] = useState("");
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [ancora, setAncora] = useState<CellPos | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!quadroId) return;
    try {
      const [quadro, profs] = await Promise.all([
        api<QuadroData>(`/quadros/${quadroId}`),
        api<Professor[]>("/professores"),
      ]);
      setData(quadro);
      setProfessores(profs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    }
  }, [quadroId]);

  useEffect(() => {
    void load();
  }, [load]);

  const slotMap = useMemo(() => {
    const map = new Map<string, QuadroSlot>();
    for (const s of data?.slots ?? []) {
      map.set(posKey({ dia: s.dia, periodo: s.periodo }), s);
    }
    return map;
  }, [data]);

  const totais = useMemo(() => {
    const slots = data?.slots ?? [];
    return {
      total: slots.length,
      abertos: slots.filter((s) => !s.matricula).length,
      cobertos: slots.filter((s) => !!s.matricula).length,
    };
  }, [data]);

  function limparSelecao() {
    setSelecao(new Set());
    setAncora(null);
  }

  function payloadCarencia(ativo: boolean) {
    if (!ativo) return { ativo: false as const };
    if (tipoCarencia === "TEMPORARIA" && !/^\d{4}-\d{2}-\d{2}$/.test(expiraEm)) {
      throw new Error("Informe a data de expiração da carência temporária.");
    }
    return {
      ativo: true as const,
      tipo: tipoCarencia,
      expira_em: tipoCarencia === "TEMPORARIA" ? expiraEm : null,
    };
  }

  async function setSlotsAtivos(ativo: boolean) {
    const cells = [...selecao].map(parseKey);
    if (cells.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const extra = payloadCarencia(ativo);
      for (const c of cells) {
        await api(`/quadros/${quadroId}/slots`, {
          method: "PUT",
          body: JSON.stringify({ dia: c.dia, periodo: c.periodo, ...extra }),
        });
      }
      await load();
      limparSelecao();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function atribuirProfessor() {
    if (!quadroId || !professorSel) {
      setError("Selecione um professor no menu.");
      return;
    }
    const cells = [...selecao].map(parseKey);
    if (cells.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      const extra = payloadCarencia(true);
      // Garante carência nas células selecionadas
      for (const c of cells) {
        await api(`/quadros/${quadroId}/slots`, {
          method: "PUT",
          body: JSON.stringify({ dia: c.dia, periodo: c.periodo, ...extra }),
        });
      }
      // Recarrega para pegar IDs dos slots
      const atualizado = await api<QuadroData>(`/quadros/${quadroId}`);
      const map = new Map(
        atualizado.slots.map((s) => [
          posKey({ dia: s.dia, periodo: s.periodo }),
          s.id,
        ]),
      );
      const ids = cells
        .map((c) => map.get(posKey(c)))
        .filter((id): id is string => !!id);

      await api(`/quadros/${quadroId}/atribuir`, {
        method: "POST",
        body: JSON.stringify({ matricula: professorSel, slot_ids: ids }),
      });
      setData(atualizado);
      await load();
      limparSelecao();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atribuir");
    } finally {
      setSaving(false);
    }
  }

  async function removerProfessor() {
    const ids = [...selecao]
      .map((k) => slotMap.get(k))
      .filter((s): s is QuadroSlot => !!s && !!s.matricula)
      .map((s) => s.id);

    if (ids.length === 0) {
      setError("Nenhuma célula selecionada tem professor.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      for (const id of ids) {
        await api(`/quadro-slots/${id}/professor`, {
          method: "PATCH",
          body: JSON.stringify({ matricula: null }),
        });
      }
      await load();
      limparSelecao();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover professor");
    } finally {
      setSaving(false);
    }
  }

  function onCellClick(e: React.MouseEvent, dia: number, periodo: number) {
    const pos = { dia, periodo };
    const key = posKey(pos);
    setError(null);

    if (e.shiftKey && ancora) {
      const keys = rangeKeys(ancora, pos);
      setSelecao((prev) => {
        if (e.ctrlKey || e.metaKey) {
          const next = new Set(prev);
          for (const k of keys) next.add(k);
          return next;
        }
        return new Set(keys);
      });
      return;
    }

    // Clique / Ctrl: alterna seleção
    setSelecao((prev) => {
      const next = e.ctrlKey || e.metaKey ? new Set(prev) : new Set<string>();
      // Sem Ctrl: começa nova seleção com esta célula (ou desmarca se era a única)
      if (!e.ctrlKey && !e.metaKey) {
        if (prev.size === 1 && prev.has(key)) return new Set();
        next.add(key);
        return next;
      }
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setAncora(pos);
  }

  async function salvarObs(texto: string) {
    if (!quadroId) return;
    setSaving(true);
    try {
      await api(`/quadros/${quadroId}/observacao`, {
        method: "PUT",
        body: JSON.stringify({ observacao: texto }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar observação");
    } finally {
      setSaving(false);
    }
  }

  if (!data && !error) {
    return <p className="text-sm text-muted">Carregando quadro...</p>;
  }

  if (!data) {
    return (
      <div>
        <ErrorBanner message={error} />
        <Link to={`/carencias/${escolaId}`} className={btnSecondary}>
          Voltar
        </Link>
      </div>
    );
  }

  const q = data.quadro;
  const turno = q.turno as Turno;
  const professorNome =
    professores.find((p) => p.matricula === professorSel)?.nome ?? "";

  const professoresNoQuadro = [
    ...new Map(
      data.slots
        .filter((s) => s.matricula)
        .map((s) => [
          s.matricula!,
          { matricula: s.matricula!, nome: s.professor_nome ?? s.matricula! },
        ]),
    ).values(),
  ];

  return (
    <div className="pb-40">
      <PageHeader
        title={`Turma ${q.turma_codigo}`}
        description={`${q.escola_nome} · ${TURNO_LABEL[turno]}${
          q.disciplina_codigo ? ` · ${q.disciplina_codigo}` : ""
        }. Selecione os horários e depois escolha a ação no menu.`}
        actions={
          <Link to={`/carencias/${escolaId}`} className={btnSecondary}>
            Voltar às turmas
          </Link>
        }
      />
      <ErrorBanner message={error} />

      <Panel className="mb-6">
        <div className="flex flex-wrap items-stretch gap-3">
          <div className="min-w-[88px] rounded-lg border border-border bg-white px-4 py-2 text-center">
            <p className="text-xs uppercase tracking-wide text-muted">Tempos</p>
            <p className="mt-1 font-display text-2xl font-semibold text-brand-dark">
              {totais.total}
            </p>
          </div>
          <div className="min-w-[88px] rounded-lg border border-warn/30 bg-amber-50 px-4 py-2 text-center">
            <p className="text-xs uppercase tracking-wide text-warn">Em aberto</p>
            <p className="mt-1 font-display text-2xl font-semibold text-warn">
              {totais.abertos}
            </p>
          </div>
          <div className="min-w-[88px] rounded-lg border border-ok/30 bg-emerald-50 px-4 py-2 text-center">
            <p className="text-xs uppercase tracking-wide text-ok">Cobertos</p>
            <p className="mt-1 font-display text-2xl font-semibold text-ok">
              {totais.cobertos}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 self-center text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-sky-50 ring-1 ring-border" />
              Real
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-amber-100 ring-1 ring-amber-200" />
              Temporária
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-rose-100 ring-1 ring-rose-200" />
              Expirada
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-emerald-100 ring-1 ring-emerald-200" />
              Com professor
            </span>
          </div>
        </div>
      </Panel>

      <div className="overflow-x-auto">
        <div className="min-w-[640px] rounded-lg border border-border bg-surface shadow-sm">
          <div
            className={`rounded-t-lg px-4 py-2 text-center text-sm font-bold tracking-wide ${TURNO_HEADER[turno]}`}
          >
            {q.turma_codigo} — {TURNO_LABEL[turno].toUpperCase()}
          </div>

          <div className="border-b border-amber-200 bg-amber-50 px-3 py-2">
            <input
              className="w-full bg-transparent text-xs text-danger outline-none placeholder:text-muted"
              placeholder="Observação (ex.: L. MÉDICA...)"
              defaultValue={q.observacao ?? ""}
              key={q.observacao ?? ""}
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next !== (q.observacao ?? "")) void salvarObs(next);
              }}
            />
          </div>

          <table className="w-full border-collapse text-center text-xs select-none sm:text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="w-10 border border-border px-2 py-2" />
                {DIAS.map((d) => (
                  <th
                    key={d.id}
                    className="border border-border px-2 py-2 font-semibold"
                  >
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERIODOS.map((periodo) => (
                <tr key={periodo}>
                  <td className="border border-border bg-slate-50 px-2 py-2 font-medium">
                    {periodo}ª
                  </td>
                  {DIAS.map((d) => {
                    const key = posKey({ dia: d.id, periodo });
                    const slot = slotMap.get(key);
                    const selecionada = selecao.has(key);
                    const coberta = !!slot?.matricula;
                    const temporaria = slot?.tipo === "TEMPORARIA";
                    const expirada = slot ? carenciaExpirada(slot) : false;

                    let cellClass =
                      "bg-white text-muted";
                    if (selecionada) {
                      cellClass =
                        "bg-brand text-white ring-2 ring-inset ring-brand-dark";
                    } else if (expirada) {
                      cellClass = "bg-rose-100 text-rose-900";
                    } else if (coberta) {
                      cellClass = "bg-emerald-100 text-brand-dark";
                    } else if (temporaria) {
                      cellClass = "bg-amber-100 text-amber-950";
                    } else if (slot) {
                      cellClass = "bg-sky-50 text-foreground";
                    }

                    const tituloParts = [
                      "Clique = selecionar · Ctrl = somar · Shift = intervalo",
                    ];
                    if (slot?.tipo) {
                      tituloParts.push(
                        `Carência ${TIPO_CARENCIA_LABEL[slot.tipo]}`,
                      );
                    }
                    if (slot?.expira_em) {
                      tituloParts.push(
                        `Expira em ${formatDataBR(slot.expira_em)}${
                          expirada ? " (expirada)" : ""
                        }`,
                      );
                    }

                    return (
                      <td key={d.id} className="border border-border p-0">
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                              e.preventDefault();
                            }
                          }}
                          onClick={(e) => onCellClick(e, d.id, periodo)}
                          className={`flex h-14 w-full flex-col items-center justify-center gap-0.5 px-1 font-medium transition hover:brightness-95 ${cellClass}`}
                          title={tituloParts.join(" · ")}
                        >
                          <span>{slot ? q.turma_codigo : "·"}</span>
                          {coberta && slot?.professor_nome ? (
                            <span className="max-w-full truncate text-[10px] font-normal opacity-80">
                              {slot.professor_nome.split(" ")[0]}
                            </span>
                          ) : null}
                          {temporaria && slot?.expira_em ? (
                            <span className="max-w-full truncate text-[9px] font-normal opacity-80">
                              {expirada ? "Expirada" : "até"}{" "}
                              {formatDataBR(slot.expira_em)}
                            </span>
                          ) : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-border px-3 py-3 text-sm">
            {professoresNoQuadro.length === 0 ? (
              <p className="text-muted">Nenhum professor neste quadro</p>
            ) : (
              <div className="space-y-1">
                {professoresNoQuadro.map((p) => {
                  const qtd = data.slots.filter(
                    (s) => s.matricula === p.matricula,
                  ).length;
                  return (
                    <div key={p.matricula} className="flex flex-wrap gap-2">
                      <Link
                        to={`/professores/${p.matricula}`}
                        className="font-medium text-brand underline-offset-2 hover:underline"
                      >
                        {p.nome} ({p.matricula})
                      </Link>
                      <span className="text-xs text-muted">{qtd} tempo(s)</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-3 bottom-5 z-50 flex justify-center lg:left-[calc(var(--app-sidebar,16rem)+1.5rem)] lg:right-6">
        <div className="pointer-events-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-surface/95 text-foreground shadow-[0_12px_40px_-16px_rgba(28,42,51,0.35)] backdrop-blur-md">
          {selecao.size === 0 ? (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
                ·
              </span>
              <div>
                <p className="text-sm font-medium text-brand-dark">
                  Nenhuma célula selecionada
                </p>
                <p className="text-xs text-muted">
                  Clique na grade · Ctrl soma · Shift marca intervalo
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-3 sm:p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-brand px-2.5 text-sm font-semibold tabular-nums text-white">
                    {selecao.size}
                  </span>
                  <div>
                    <p className="text-sm font-medium leading-none text-brand-dark">
                      horário{selecao.size === 1 ? "" : "s"} selecionado
                      {selecao.size === 1 ? "" : "s"}
                    </p>
                    {saving ? (
                      <p className="mt-1 text-xs text-muted">Salvando…</p>
                    ) : (
                      <p className="mt-1 text-xs text-muted">
                        Defina o tipo e a ação
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition hover:bg-brand-soft/60 hover:text-brand-dark"
                  onClick={limparSelecao}
                >
                  Limpar seleção
                </button>
              </div>

              <div className="grid gap-2 lg:grid-cols-[1.15fr_1fr]">
                <section className="rounded-xl border border-border bg-white/70 p-2.5">
                  <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Carência
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-lg bg-background p-0.5 ring-1 ring-border">
                      {(
                        [
                          ["REAL", "Real"],
                          ["TEMPORARIA", "Temporária"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setTipoCarencia(value)}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                            tipoCarencia === value
                              ? "bg-brand text-white shadow-sm"
                              : "text-muted hover:text-foreground"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {tipoCarencia === "TEMPORARIA" ? (
                      <input
                        type="date"
                        aria-label="Data de expiração"
                        className="h-8 rounded-lg border border-border bg-white px-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand/30"
                        value={expiraEm}
                        min={hojeISO()}
                        onChange={(e) => setExpiraEm(e.target.value)}
                      />
                    ) : null}

                    <div className="ml-auto flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="h-8 rounded-lg bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand-dark disabled:opacity-45"
                        disabled={
                          saving ||
                          (tipoCarencia === "TEMPORARIA" && !expiraEm)
                        }
                        onClick={() => void setSlotsAtivos(true)}
                      >
                        Marcar
                      </button>
                      <button
                        type="button"
                        className="h-8 rounded-lg border border-border bg-white px-3 text-xs font-medium text-foreground transition hover:bg-background disabled:opacity-45"
                        disabled={saving}
                        onClick={() => void setSlotsAtivos(false)}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-white/70 p-2.5">
                  <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Professor
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Professor"
                      className="h-8 min-w-[160px] flex-1 rounded-lg border border-border bg-white px-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand/30"
                      value={professorSel}
                      onChange={(e) => setProfessorSel(e.target.value)}
                    >
                      <option value="">Selecione…</option>
                      {professores.map((p) => (
                        <option key={p.matricula} value={p.matricula}>
                          {p.nome} ({p.matricula})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="h-8 rounded-lg bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand-dark disabled:opacity-45"
                      disabled={
                        saving ||
                        !professorSel ||
                        (tipoCarencia === "TEMPORARIA" && !expiraEm)
                      }
                      onClick={() => void atribuirProfessor()}
                    >
                      {professorSel
                        ? `Atribuir ${professorNome.split(" ")[0]}`
                        : "Atribuir"}
                    </button>
                    <button
                      type="button"
                      className="h-8 rounded-lg border border-danger/25 bg-white px-3 text-xs font-medium text-danger transition hover:bg-red-50 disabled:opacity-45"
                      disabled={saving}
                      onClick={() => void removerProfessor()}
                    >
                      Tirar
                    </button>
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
