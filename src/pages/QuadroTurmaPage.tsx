import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ConfirmDialog,
  ErrorBanner,
  PageHeader,
  Panel,
  btnSecondary,
} from "@/components/ui";
import { api } from "@/lib/api";
import {
  DIAS,
  MODALIDADE_COBERTURA_LABEL,
  PERIODOS,
  TIPO_CARENCIA_LABEL,
  TURNO_HEADER,
  TURNO_LABEL,
  type ModalidadeCobertura,
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

function primeiroNome(nome?: string | null) {
  const n = (nome ?? "").trim();
  if (!n) return "—";
  return n.split(/\s+/)[0]!;
}

function carenciaExpirada(slot: QuadroSlot) {
  return (
    slot.tipo === "TEMPORARIA" &&
    !!slot.expira_em &&
    slot.expira_em < hojeISO()
  );
}

function turmasDoQuadro(q: Quadro): string[] {
  if (Array.isArray(q.turmas) && q.turmas.length > 0) return q.turmas;
  return String(q.turma_codigo || "")
    .split("+")
    .map((t) => t.trim())
    .filter(Boolean);
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
  const navigate = useNavigate();
  const [data, setData] = useState<QuadroData | null>(null);
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [professorSel, setProfessorSel] = useState("");
  const [buscaProfessor, setBuscaProfessor] = useState("");
  const [openProfSelect, setOpenProfSelect] = useState(false);
  const profSelectRef = useRef<HTMLDivElement>(null);
  const profListId = useId();
  const [tipoCarencia, setTipoCarencia] = useState<TipoCarencia>("REAL");
  const [expiraEm, setExpiraEm] = useState("");
  const [modalidadeCobertura, setModalidadeCobertura] = useState<ModalidadeCobertura>("HORA_EXTRA");
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [ancora, setAncora] = useState<CellPos | null>(null);
  const [saving, setSaving] = useState(false);
  const [turmaAtiva, setTurmaAtiva] = useState<string>("");
  const [confirmDesmembrar, setConfirmDesmembrar] = useState(false);
  const [confirmLicenca, setConfirmLicenca] = useState(false);
  const [confirmEncerrarLicenca, setConfirmEncerrarLicenca] = useState(false);
  const [licencaAte, setLicencaAte] = useState("");
  const [barMinimizada, setBarMinimizada] = useState(true);

  const load = useCallback(async () => {
    if (!quadroId) return;
    try {
      const [quadro, profs] = await Promise.all([
        api<QuadroData>(`/quadros/${quadroId}`),
        api<Professor[]>("/professores"),
      ]);
      setData(quadro);
      setProfessores(profs);
      const turmas = turmasDoQuadro(quadro.quadro);
      setTurmaAtiva((prev) =>
        prev && turmas.some((t) => t.toUpperCase() === prev.toUpperCase())
          ? prev
          : (turmas[0] ?? ""),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    }
  }, [quadroId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!profSelectRef.current?.contains(e.target as Node)) {
        setOpenProfSelect(false);
        setBuscaProfessor("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const turmas = useMemo(
    () => (data ? turmasDoQuadro(data.quadro) : []),
    [data],
  );

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

  const abertosPorTurma = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of turmas) map.set(t, 0);
    for (const s of data?.slots ?? []) {
      if (s.matricula) continue;
      const t = s.turma_codigo || turmas[0] || "";
      if (!t) continue;
      map.set(t, (map.get(t) ?? 0) + 1);
    }
    return map;
  }, [data, turmas]);

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
      turma_codigo: turmaAtiva || undefined,
    };
  }

  async function setSlotsAtivos(ativo: boolean) {
    const cells = [...selecao].map(parseKey);
    if (cells.length === 0) return;
    if (ativo && !turmaAtiva) {
      setError("Selecione a turma da carência.");
      return;
    }

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

    const algumSemTurma = cells.some((c) => {
      const slot = slotMap.get(posKey(c));
      return !slot?.turma_codigo;
    });
    if (algumSemTurma && !turmaAtiva) {
      setError("Selecione a turma para os horários sem turma definida.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      for (const c of cells) {
        const slotExistente = slotMap.get(posKey(c));
        const turmaDoSlot = slotExistente?.turma_codigo || turmaAtiva;
        const tipoDoSlot = slotExistente?.tipo || tipoCarencia;
        const expiraDoSlot = slotExistente?.expira_em ?? (tipoCarencia === "TEMPORARIA" ? expiraEm : null);
        const modalidadeDoSlot = slotExistente?.modalidade_cobertura || modalidadeCobertura;
        
        await api(`/quadros/${quadroId}/slots`, {
          method: "PUT",
          body: JSON.stringify({
            dia: c.dia,
            periodo: c.periodo,
            ativo: true,
            tipo: tipoDoSlot,
            expira_em: expiraDoSlot,
            turma_codigo: turmaDoSlot,
            modalidade_cobertura: modalidadeDoSlot,
          }),
        });
      }
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

  async function abrirLicenca() {
    if (!quadroId) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(licencaAte)) {
      setError("Informe a data de retorno da licença.");
      return;
    }
    const ids = [...selecao]
      .map((k) => slotMap.get(k))
      .filter((s): s is QuadroSlot => !!s && (!!s.matricula || !!s.titular_matricula))
      .map((s) => s.id);

    if (ids.length === 0) {
      setError("Selecione horários com professor para abrir licença.");
      return;
    }

    setSaving(true);
    setError(null);
    setConfirmLicenca(false);
    try {
      const result = await api<{ updated: number; erros: string[] }>(
        `/quadros/${quadroId}/licenca`,
        {
          method: "POST",
          body: JSON.stringify({ slot_ids: ids, ate: licencaAte }),
        },
      );
      if (result.erros?.length) {
        setError(result.erros[0] ?? "Erro ao abrir licença");
      }
      await load();
      limparSelecao();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao abrir licença");
    } finally {
      setSaving(false);
    }
  }

  async function encerrarLicenca() {
    if (!quadroId) return;
    const ids = [...selecao]
      .map((k) => slotMap.get(k))
      .filter((s): s is QuadroSlot => !!s && !!s.titular_matricula)
      .map((s) => s.id);

    if (ids.length === 0) {
      setError("Selecione horários em licença para encerrar.");
      return;
    }

    setSaving(true);
    setError(null);
    setConfirmEncerrarLicenca(false);
    try {
      const result = await api<{ updated: number; erros: string[] }>(
        `/quadros/${quadroId}/encerrar-licenca`,
        {
          method: "POST",
          body: JSON.stringify({ slot_ids: ids }),
        },
      );
      if (result.erros?.length) {
        setError(result.erros[0] ?? "Erro ao encerrar licença");
      }
      await load();
      limparSelecao();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao encerrar licença");
    } finally {
      setSaving(false);
    }
  }

  function onCellClick(e: React.MouseEvent, dia: number, periodo: number) {
    const pos = { dia, periodo };
    const key = posKey(pos);
    setError(null);

    if (e.shiftKey && ancora) {
      setSelecao(new Set(rangeKeys(ancora, pos)));
      return;
    }

    const estaAdicionando = !selecao.has(key);
    const selecaoEstaviaVazia = selecao.size === 0;

    setSelecao((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setAncora(pos);

    const slot = slotMap.get(key);
    if (slot?.turma_codigo && estaAdicionando && selecaoEstaviaVazia) {
      setTurmaAtiva(slot.turma_codigo);
    }
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

  const slotsSelecionados = useMemo(() => {
    return [...selecao]
      .map((k) => slotMap.get(k))
      .filter((s): s is QuadroSlot => !!s);
  }, [selecao, slotMap]);

  const turmasDosSlotsSelecionados = useMemo(() => {
    const set = new Set<string>();
    for (const s of slotsSelecionados) {
      const t = s.turma_codigo || turmas[0] || "";
      if (t) set.add(t);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [slotsSelecionados, turmas]);

  const podeDesmembrar =
    slotsSelecionados.length > 0 &&
    turmas.length > 1 &&
    turmasDosSlotsSelecionados.length > 0 &&
    turmasDosSlotsSelecionados.length < turmas.length;

  const podeAbrirLicenca = slotsSelecionados.some(
    (s) => !!s.matricula || !!s.titular_matricula,
  );
  const podeEncerrarLicenca = slotsSelecionados.some((s) => !!s.titular_matricula);
  const qtdLicencaSelecionada = slotsSelecionados.filter(
    (s) => !!s.titular_matricula,
  ).length;

  async function desmembrar() {
    if (!quadroId || slotsSelecionados.length === 0 || turmasDosSlotsSelecionados.length === 0) return;
    setConfirmDesmembrar(false);
    setSaving(true);
    setError(null);
    try {
      const result = await api<{
        novo_quadro_id: string;
        turmas_desmembradas: string[];
        turmas_restantes: string[];
        slots_movidos: number;
      }>(`/quadros/${quadroId}/desmembrar`, {
        method: "POST",
        body: JSON.stringify({
          slot_ids: slotsSelecionados.map((s) => s.id),
          turmas: turmasDosSlotsSelecionados,
        }),
      });
      limparSelecao();
      navigate(`/carencias/doc1/${escolaId}/${result.novo_quadro_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao desmembrar");
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
        <Link to={`/carencias/doc1/${escolaId}`} className={btnSecondary}>
          Voltar
        </Link>
      </div>
    );
  }

  const q = data.quadro;
  const turno = q.turno as Turno;
  const professorNome =
    professores.find((p) => p.matricula === professorSel)?.nome ?? "";

  const qProf = buscaProfessor.trim().toLowerCase();
  const professoresFiltrados = qProf
    ? professores.filter(
        (p) =>
          p.nome.toLowerCase().includes(qProf) ||
          p.matricula.toLowerCase().includes(qProf),
      )
    : professores;

  function escolherProfessor(matricula: string) {
    setProfessorSel(matricula);
    setBuscaProfessor("");
    setOpenProfSelect(false);
  }

  const professoresNoQuadro = (() => {
    type Item = {
      matricula: string;
      nome: string;
      tempos: number;
      comoTitularLicenca: number;
      comoSubstituto: number;
    };
    const map = new Map<string, Item>();
    for (const s of data.slots) {
      if (s.matricula) {
        const cur = map.get(s.matricula) ?? {
          matricula: s.matricula,
          nome: s.professor_nome ?? s.matricula,
          tempos: 0,
          comoTitularLicenca: 0,
          comoSubstituto: 0,
        };
        cur.tempos += 1;
        if (s.titular_matricula) cur.comoSubstituto += 1;
        map.set(s.matricula, cur);
      }
      if (s.titular_matricula) {
        const cur = map.get(s.titular_matricula) ?? {
          matricula: s.titular_matricula,
          nome: s.titular_nome ?? s.titular_matricula,
          tempos: 0,
          comoTitularLicenca: 0,
          comoSubstituto: 0,
        };
        cur.comoTitularLicenca += 1;
        map.set(s.titular_matricula, cur);
      }
    }
    return [...map.values()].sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR"),
    );
  })();

  const titulo =
    turmas.length <= 1
      ? `Turma ${turmas[0] || q.turma_codigo}`
      : `${turmas.length} turmas`;

  return (
    <div className="pb-40">
      <PageHeader
        title={titulo}
        description={`${q.escola_nome} · ${TURNO_LABEL[turno]}${
          q.disciplina_codigo ? ` · ${q.disciplina_codigo}` : ""
        }. Selecione os horários, a turma e a ação no menu.`}
        actions={
          <Link to={`/carencias/doc1/${escolaId}`} className={btnSecondary}>
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 self-center text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-sky-200 ring-1 ring-sky-300" />
              Real em aberto
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-rose-200 ring-1 ring-rose-300" />
              Temporária em aberto
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-emerald-200 ring-1 ring-emerald-300" />
              Real · H.E.
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-teal-200 ring-1 ring-teal-300" />
              Real · Normal
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-orange-200 ring-1 ring-orange-300" />
              Temp. · H.E.
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-amber-200 ring-1 ring-amber-300" />
              Temp. · Normal
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-fuchsia-200 ring-1 ring-fuchsia-300" />
              Licença em aberto
            </span>
          </div>
        </div>
      </Panel>

      <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <div
          className={`rounded-t-lg px-4 py-2 text-center text-sm font-bold tracking-wide ${TURNO_HEADER[turno]}`}
        >
          {turmas.join(" · ")} — {TURNO_LABEL[turno].toUpperCase()}
          {q.disciplina_codigo ? ` · ${q.disciplina_codigo}` : ""}
        </div>

        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2">
          <textarea
            className="block w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent text-xs leading-relaxed text-danger outline-none placeholder:text-muted"
            placeholder="Observação (ex.: L. MÉDICA...)"
            rows={1}
            defaultValue={q.observacao ?? ""}
            key={q.observacao ?? ""}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
            ref={(el) => {
              if (!el) return;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next !== (q.observacao ?? "")) void salvarObs(next);
            }}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[640px] w-full border-collapse text-center text-xs select-none sm:text-sm">
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
                    const emLicenca = !!slot?.titular_matricula;
                    const temporaria = slot?.tipo === "TEMPORARIA";
                    const expirada = slot ? carenciaExpirada(slot) : false;
                    const turmaCell =
                      slot?.turma_codigo ||
                      (slot ? turmas[0] || q.turma_codigo : "");

                    let cellClass = "bg-white text-muted";
                    const isHoraNormal = slot?.modalidade_cobertura === "NORMAL";
                    if (selecionada) {
                      cellClass =
                        "bg-brand text-white ring-2 ring-inset ring-brand-dark";
                    } else if (slot) {
                      if (emLicenca && !coberta) {
                        cellClass = "bg-fuchsia-200 text-fuchsia-950";
                      } else if (coberta && temporaria && isHoraNormal) {
                        cellClass = "bg-amber-200 text-amber-950";
                      } else if (coberta && temporaria) {
                        cellClass = "bg-orange-200 text-orange-950";
                      } else if (coberta && isHoraNormal) {
                        cellClass = "bg-teal-200 text-teal-950";
                      } else if (coberta) {
                        cellClass = "bg-emerald-200 text-emerald-950";
                      } else if (temporaria) {
                        cellClass = "bg-rose-200 text-rose-950";
                      } else {
                        cellClass = "bg-sky-200 text-sky-950";
                      }
                    }

                    const tituloParts = [
                      "Clique = somar/tirar · Shift = intervalo",
                    ];
                    if (turmaCell) tituloParts.push(`Turma ${turmaCell}`);
                    if (emLicenca) {
                      tituloParts.push(
                        `Titular (licença): ${slot?.titular_nome ?? slot?.titular_matricula}`,
                      );
                      if (coberta) {
                        tituloParts.push(
                          `Substituto: ${slot?.professor_nome ?? slot?.matricula}`,
                        );
                      } else {
                        tituloParts.push("Aguardando substituto");
                      }
                    }
                    if (slot?.tipo) {
                      tituloParts.push(
                        `Carência ${TIPO_CARENCIA_LABEL[slot.tipo]}`,
                      );
                    }
                    if (slot?.modalidade_cobertura) {
                      tituloParts.push(
                        MODALIDADE_COBERTURA_LABEL[slot.modalidade_cobertura],
                      );
                    }
                    if (slot?.expira_em) {
                      tituloParts.push(
                        `até ${formatDataBR(slot.expira_em)}${
                          expirada ? " (expirada)" : ""
                        }`,
                      );
                    }

                    return (
                      <td key={d.id} className="border border-border p-0">
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            if (e.shiftKey) e.preventDefault();
                          }}
                          onClick={(e) => onCellClick(e, d.id, periodo)}
                          className={`flex w-full flex-col items-center justify-center gap-0.5 px-1 font-medium transition hover:brightness-95 ${
                            emLicenca ? "min-h-[4.5rem] py-1" : "h-14"
                          } ${cellClass}`}
                          title={tituloParts.join(" · ")}
                        >
                          <span>{slot ? turmaCell : "·"}</span>
                          {emLicenca ? (
                            <>
                              <span className="max-w-full truncate text-[9px] font-normal leading-tight opacity-90">
                                Tit: {primeiroNome(slot?.titular_nome ?? slot?.titular_matricula)}
                              </span>
                              <span className="max-w-full truncate text-[9px] font-normal leading-tight opacity-90">
                                {coberta
                                  ? `Sub: ${primeiroNome(slot?.professor_nome ?? slot?.matricula)}`
                                  : "Sub: —"}
                              </span>
                            </>
                          ) : coberta && slot?.professor_nome ? (
                            <span className="max-w-full truncate text-[10px] font-normal opacity-80">
                              {primeiroNome(slot.professor_nome)}
                            </span>
                          ) : null}
                          {(temporaria || emLicenca) && slot?.expira_em ? (
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
        </div>

        <div className="border-t border-border px-3 py-3 text-sm">
          {professoresNoQuadro.length === 0 ? (
            <p className="text-muted">Nenhum professor neste quadro</p>
          ) : (
            <div className="space-y-1">
              {professoresNoQuadro.map((p) => {
                const papeis: string[] = [];
                if (p.comoTitularLicenca > 0) {
                  papeis.push(`licença ${p.comoTitularLicenca}`);
                }
                if (p.comoSubstituto > 0) {
                  papeis.push(`substituto ${p.comoSubstituto}`);
                }
                if (p.tempos > p.comoSubstituto) {
                  papeis.push(`${p.tempos - p.comoSubstituto} tempo(s)`);
                } else if (p.tempos > 0 && p.comoSubstituto === 0) {
                  papeis.push(`${p.tempos} tempo(s)`);
                }
                return (
                  <div key={p.matricula} className="flex flex-wrap gap-2">
                    <Link
                      to={`/professores/${p.matricula}`}
                      state={{
                        from: `/carencias/${escolaId}/${quadroId}`,
                      }}
                      className="font-medium text-brand underline-offset-2 hover:underline"
                    >
                      {p.nome} ({p.matricula})
                    </Link>
                    <span className="text-xs text-muted">
                      {papeis.join(" · ") || "0 tempo(s)"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-3 bottom-5 z-50 flex justify-center lg:left-[calc(var(--app-sidebar,16rem)+1.5rem)] lg:right-6">
        <div className="pointer-events-auto w-full overflow-hidden rounded-2xl border border-border bg-surface/95 text-foreground shadow-[0_12px_40px_-16px_rgba(28,42,51,0.35)] backdrop-blur-md">
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
                  Clique na grade para somar · Shift marca intervalo
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-3 sm:p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-dark"
                    onClick={() => setBarMinimizada((v) => !v)}
                    title={barMinimizada ? "Expandir" : "Minimizar"}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 transition-transform ${barMinimizada ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div>
                    <p className="text-sm font-medium leading-none text-brand-dark">
                      {selecao.size} horário{selecao.size === 1 ? "" : "s"} selecionado
                      {selecao.size === 1 ? "" : "s"}
                    </p>
                    {saving ? (
                      <p className="mt-1 text-xs text-muted">Salvando…</p>
                    ) : (
                      <p className="mt-1 text-xs text-muted">
                        {barMinimizada ? "Clique na seta para expandir" : "Escolha a turma e a ação"}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {podeDesmembrar && !barMinimizada && (
                    <button
                      type="button"
                      className="h-8 cursor-pointer rounded-lg border border-border bg-white px-3 text-xs font-medium text-foreground transition hover:bg-background disabled:opacity-45"
                      disabled={saving}
                      onClick={() => setConfirmDesmembrar(true)}
                    >
                      Desmembrar ({turmasDosSlotsSelecionados.join(", ")})
                    </button>
                  )}
                  <button
                    type="button"
                    className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition hover:bg-brand-soft/60 hover:text-brand-dark"
                    onClick={limparSelecao}
                  >
                    Limpar seleção
                  </button>
                </div>
              </div>

              {!barMinimizada && (
              <div className="grid gap-2 lg:grid-cols-[1.15fr_1fr]">
                <section className="rounded-xl border border-border bg-white/70 p-2.5">
                  <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Carência
                  </p>

                  {turmas.length > 0 ? (
                    <div className="mb-2.5 flex flex-wrap gap-1.5 px-0.5">
                      {turmas.map((t) => {
                        const ativa =
                          t.toUpperCase() === turmaAtiva.toUpperCase();
                        const abertos = abertosPorTurma.get(t) ?? 0;
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTurmaAtiva(t)}
                            className={`min-w-[3.25rem] rounded-lg border px-2.5 py-1.5 text-left transition ${
                              ativa
                                ? "border-brand bg-brand text-white shadow-sm"
                                : "border-border bg-white text-foreground hover:border-brand/40 hover:bg-brand-soft/40"
                            }`}
                            title={`Turma ${t}`}
                          >
                            <span className="block text-sm font-semibold leading-none">
                              {t}
                            </span>
                            <span
                              className={`mt-0.5 block text-[10px] ${
                                ativa ? "text-white/80" : "text-muted"
                              }`}
                            >
                              {abertos} aberto{abertos === 1 ? "" : "s"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

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
                        className="h-8 cursor-pointer rounded-lg bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-45"
                        disabled={
                          saving ||
                          !turmaAtiva ||
                          (tipoCarencia === "TEMPORARIA" && !expiraEm)
                        }
                        onClick={() => void setSlotsAtivos(true)}
                      >
                        Marcar{turmaAtiva ? ` · ${turmaAtiva}` : ""}
                      </button>
                      <button
                        type="button"
                        className="h-8 cursor-pointer rounded-lg border border-border bg-white px-3 text-xs font-medium text-foreground transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-45"
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
                  <div className="mb-2 inline-flex rounded-lg bg-background p-0.5 ring-1 ring-border">
                    {(
                      [
                        ["HORA_EXTRA", "Hora Extra"],
                        ["NORMAL", "Hora Normal"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setModalidadeCobertura(value)}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                          modalidadeCobertura === value
                            ? "bg-brand text-white shadow-sm"
                            : "text-muted hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[160px] flex-1" ref={profSelectRef}>
                      <input
                        aria-label="Professor"
                        role="combobox"
                        aria-expanded={openProfSelect}
                        aria-controls={profListId}
                        aria-autocomplete="list"
                        className="h-8 w-full rounded-lg border border-border bg-white px-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand/30"
                        placeholder={
                          professorSel
                            ? `${professorNome} (${professorSel})`
                            : "Buscar nome ou matrícula…"
                        }
                        value={
                          openProfSelect || buscaProfessor ? buscaProfessor : ""
                        }
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
                            escolherProfessor(professoresFiltrados[0].matricula);
                          }
                          if (
                            e.key === "Backspace" &&
                            !buscaProfessor &&
                            professorSel
                          ) {
                            setProfessorSel("");
                          }
                        }}
                      />
                      {openProfSelect ? (
                        <ul
                          id={profListId}
                          role="listbox"
                          className="absolute bottom-full z-30 mb-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-lg"
                        >
                          {professoresFiltrados.length === 0 ? (
                            <li className="px-3 py-2 text-xs text-muted">
                              Nenhum professor encontrado.
                            </li>
                          ) : (
                            professoresFiltrados.slice(0, 80).map((p) => {
                              const active = p.matricula === professorSel;
                              return (
                                <li
                                  key={p.matricula}
                                  role="option"
                                  aria-selected={active}
                                >
                                  <button
                                    type="button"
                                    className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-xs transition ${
                                      active
                                        ? "bg-brand-soft/50"
                                        : "hover:bg-brand-soft/25"
                                    }`}
                                    onMouseDown={(ev) => ev.preventDefault()}
                                    onClick={() =>
                                      escolherProfessor(p.matricula)
                                    }
                                  >
                                    <span className="font-medium leading-snug">
                                      {p.nome}
                                    </span>
                                    <span className="text-[10px] text-muted">
                                      {p.matricula}
                                      {p.cargo ? ` · ${p.cargo}` : ""}
                                    </span>
                                  </button>
                                </li>
                              );
                            })
                          )}
                        </ul>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="h-8 cursor-pointer rounded-lg bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={saving || !professorSel}
                      onClick={() => void atribuirProfessor()}
                    >
                      {professorSel
                        ? `Atribuir ${professorNome.split(" ")[0]}`
                        : "Atribuir"}
                    </button>
                    <button
                      type="button"
                      className="h-8 cursor-pointer rounded-lg border border-danger/25 bg-white px-3 text-xs font-medium text-danger transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={saving}
                      onClick={() => void removerProfessor()}
                    >
                      Tirar
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/70 pt-2">
                    <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                      Licença
                    </span>
                    <input
                      type="date"
                      aria-label="Data de retorno da licença"
                      className="h-8 rounded-lg border border-border bg-white px-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand/30"
                      value={licencaAte}
                      min={hojeISO()}
                      onChange={(e) => setLicencaAte(e.target.value)}
                    />
                    <button
                      type="button"
                      className="h-8 cursor-pointer rounded-lg border border-fuchsia-300 bg-fuchsia-50 px-3 text-xs font-medium text-fuchsia-900 transition hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={saving || !podeAbrirLicenca || !licencaAte}
                      onClick={() => setConfirmLicenca(true)}
                    >
                      Abrir licença
                    </button>
                    <button
                      type="button"
                      className="h-8 cursor-pointer rounded-lg border border-border bg-white px-3 text-xs font-medium text-foreground transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={saving || !podeEncerrarLicenca}
                      onClick={() => setConfirmEncerrarLicenca(true)}
                    >
                      Encerrar licença
                    </button>
                  </div>
                </section>
              </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDesmembrar}
        title="Desmembrar turmas"
        message={
          <>
            Criar um novo quadro com{" "}
            <strong>{turmasDosSlotsSelecionados.join(", ")}</strong> e mover{" "}
            <strong>{slotsSelecionados.length}</strong> slot(s) para ele?
            <br />
            <span className="text-muted">
              As turmas restantes ({turmas.filter((t) => !turmasDosSlotsSelecionados.includes(t)).join(", ")}) ficarão no quadro atual.
            </span>
          </>
        }
        confirmLabel="Desmembrar"
        onConfirm={() => void desmembrar()}
        onClose={() => setConfirmDesmembrar(false)}
      />

      <ConfirmDialog
        open={confirmLicenca}
        title="Abrir licença"
        message={
          <>
            O titular fica registrado e o horário vira carência temporária até{" "}
            <strong>{licencaAte ? formatDataBR(licencaAte) : "—"}</strong>.
            <br />
            Depois você pode atribuir um substituto. Ao encerrar, o titular volta
            automaticamente.
          </>
        }
        confirmLabel="Abrir licença"
        onConfirm={() => void abrirLicenca()}
        onClose={() => setConfirmLicenca(false)}
      />

      <ConfirmDialog
        open={confirmEncerrarLicenca}
        title="Encerrar licença"
        message={
          <>
            Devolver <strong>{qtdLicencaSelecionada}</strong> horário(s) ao
            titular e remover o substituto, se houver?
          </>
        }
        confirmLabel="Encerrar licença"
        onConfirm={() => void encerrarLicenca()}
        onClose={() => setConfirmEncerrarLicenca(false)}
      />
    </div>
  );
}
