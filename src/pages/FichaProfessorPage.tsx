import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  EmptyState,
  ErrorBanner,
  PageHeader,
  Panel,
  StatCard,
  btnSecondary,
} from "@/components/ui";
import { api } from "@/lib/api";
import {
  DIAS,
  PERIODOS,
  TIPO_HE_LABEL,
  formatDateBR,
  isHeExpirada,
  isHeVigente,
  type Alocacao,
  type HoraExtra,
  type Professor,
  type ProfessorLotacao,
  type QuadroSlot,
} from "@/lib/types";

type Ficha = {
  professor: Professor;
  horas_extra: HoraExtra[];
  alocacoes: Alocacao[];
  slots: QuadroSlot[];
  lotacoes: ProfessorLotacao[];
};

type LocationState = {
  from?: string;
};

function VoltarButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from;

  return (
    <button
      type="button"
      className={btnSecondary}
      onClick={() => {
        if (from) {
          navigate(from);
          return;
        }
        if (window.history.length > 1) {
          navigate(-1);
          return;
        }
        navigate("/configuracao?tab=professores");
      }}
    >
      Voltar
    </button>
  );
}

const TABS = [
  { id: "resumo", label: "Resumo" },
  { id: "info", label: "Informações Adicionais" },
  { id: "lotacoes", label: "Lotações" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function FichaProfessorPage() {
  const { matricula } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as TabId | null;
  const activeTab: TabId = TABS.some((t) => t.id === tabParam) ? tabParam! : "resumo";
  const [data, setData] = useState<Ficha | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!matricula) return;
    api<Ficha>(`/professores/${matricula}`)
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Erro ao carregar"),
      );
  }, [matricula]);

  function setTab(tab: TabId) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  }

  if (error) {
    return (
      <div>
        <ErrorBanner message={error} />
        <VoltarButton />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted">Carregando ficha...</p>;
  }

  const { professor: p, horas_extra: hes, alocacoes: alocs, slots = [], lotacoes = [] } = data;
  const heAutorizada = hes
    .filter((h) => isHeVigente(h))
    .reduce((acc, h) => acc + h.tempos_autorizados, 0);
  const heExpirada = hes.filter((h) => isHeExpirada(h)).length;
  const slotsComoCobertura = slots.filter((s) => s.matricula === p.matricula);
  const slotsEmLicenca = slots.filter(
    (s) => s.titular_matricula === p.matricula || !!s.em_licenca,
  );
  const slotsHoraExtra = slotsComoCobertura.filter(
    (s) => s.modalidade_cobertura === "HORA_EXTRA",
  );
  const slotsHoraNormal = slotsComoCobertura.filter(
    (s) => s.modalidade_cobertura === "NORMAL",
  );
  const temposAloc =
    alocs.filter((a) => a.status === "ATIVA").reduce((acc, a) => acc + a.tempos, 0) +
    slotsHoraExtra.length;
  const saldo = heAutorizada - temposAloc;

  const extras = parseExtras(p.extras);

  return (
    <div>
      <PageHeader
        title={p.nome}
        description={`Matrícula ${p.matricula}${p.funcao ? ` · ${p.funcao}` : ""}${p.cargo ? ` · ${p.cargo}` : ""}`}
        actions={<VoltarButton />}
      />

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-brand text-brand"
                : "text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: Resumo */}
      {activeTab === "resumo" && (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="HE autorizada vigente" value={heAutorizada} tone="ok" />
            <StatCard
              label="HE expirada"
              value={heExpirada}
              tone={heExpirada > 0 ? "danger" : "default"}
            />
            <StatCard label="Tempos alocados (HE)" value={temposAloc} />
            <StatCard
              label="Saldo (HE − alocado)"
              value={saldo}
              tone={saldo < 0 ? "danger" : saldo === 0 ? "ok" : "warn"}
            />
            <StatCard label="Hora normal" value={slotsHoraNormal.length} tone="default" />
            {slotsEmLicenca.length > 0 ? (
              <StatCard
                label="Em licença"
                value={slotsEmLicenca.length}
                tone="warn"
              />
            ) : null}
          </div>

          <div className="mb-6 space-y-6">
            <Panel>
              <h2 className="mb-3 font-display text-xl font-semibold text-brand-dark">
                Hora Extra
              </h2>
              {hes.length === 0 ? (
                <EmptyState message="Nenhuma HE para este professor." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-border text-muted">
                      <tr>
                        <th className="px-2 py-2 font-medium">Matrícula</th>
                        <th className="px-2 py-2 font-medium">Cargo</th>
                        <th className="px-2 py-2 font-medium">Função</th>
                        <th className="px-2 py-2 font-medium">Tempos</th>
                        <th className="px-2 py-2 font-medium">Unidade</th>
                        <th className="px-2 py-2 font-medium">Tipo</th>
                        <th className="px-2 py-2 font-medium">Início</th>
                        <th className="px-2 py-2 font-medium">Término</th>
                        <th className="px-2 py-2 font-medium">Disciplina</th>
                        <th className="px-2 py-2 font-medium">Lotação</th>
                        <th className="px-2 py-2 font-medium">Memo</th>
                        <th className="px-2 py-2 font-medium">Observação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hes.map((h) => (
                        <tr key={h.id} className="border-b border-border/70">
                          <td className="px-2 py-2 whitespace-nowrap">
                            {h.matricula}
                          </td>
                          <td className="px-2 py-2">{h.cargo ?? p.cargo ?? "—"}</td>
                          <td className="px-2 py-2">{h.funcao ?? p.funcao ?? "—"}</td>
                          <td className="px-2 py-2 font-medium">
                            {h.tempos_autorizados}
                          </td>
                          <td className="px-2 py-2">{h.unidade ?? "TEMPOS"}</td>
                          <td className="px-2 py-2">{TIPO_HE_LABEL[h.tipo]}</td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            {formatDateBR(h.inicio)}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            {formatDateBR(h.termino)}
                          </td>
                          <td className="px-2 py-2">
                            {h.disciplina_nome
                              ? `${h.disciplina_nome}${h.disciplina_codigo ? ` (${h.disciplina_codigo})` : ""}`
                              : (h.disciplina_codigo ?? "—")}
                          </td>
                          <td className="px-2 py-2">{h.lotacao_origem ?? "—"}</td>
                          <td className="px-2 py-2">{h.memo ?? "—"}</td>
                          <td className="px-2 py-2 max-w-xs">
                            {h.observacao ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel>
              <h2 className="mb-3 font-display text-xl font-semibold text-brand-dark">
                Carências Cobertas
              </h2>
              {(() => {
                const ESCOLA_COLORS = [
                  { bg: "bg-sky-200", text: "text-sky-900", ring: "ring-sky-300" },
                  { bg: "bg-emerald-200", text: "text-emerald-900", ring: "ring-emerald-300" },
                  { bg: "bg-violet-200", text: "text-violet-900", ring: "ring-violet-300" },
                  { bg: "bg-amber-200", text: "text-amber-900", ring: "ring-amber-300" },
                  { bg: "bg-rose-200", text: "text-rose-900", ring: "ring-rose-300" },
                  { bg: "bg-cyan-200", text: "text-cyan-900", ring: "ring-cyan-300" },
                  { bg: "bg-orange-200", text: "text-orange-900", ring: "ring-orange-300" },
                  { bg: "bg-teal-200", text: "text-teal-900", ring: "ring-teal-300" },
                ];

                const TURNO_COLORS: Record<string, string> = {
                  MANHA: "bg-[#e67a2e]",
                  TARDE: "bg-[#2f6fed]",
                  NOITE: "bg-[#7c3aed]",
                };

                const TURNO_LABELS: Record<string, string> = {
                  MANHA: "Manhã",
                  TARDE: "Tarde",
                  NOITE: "Noite",
                };

                const escolas = [...new Set(slots.map((s) => s.escola_nome ?? "—"))];
                const escolaColorMap = new Map(
                  escolas.map((e, i) => [e, ESCOLA_COLORS[i % ESCOLA_COLORS.length]!])
                );

                const slotsPorTurno = new Map<string, QuadroSlot[]>();
                for (const s of slots) {
                  const turno = s.turno ?? "MANHA";
                  if (!slotsPorTurno.has(turno)) slotsPorTurno.set(turno, []);
                  slotsPorTurno.get(turno)!.push(s);
                }

                // Resumo: turma + faixa de tempos (+ validade / licença)
                type ResumoItem = {
                  key: string;
                  escola: string;
                  turma: string;
                  turno: string;
                  dia: number;
                  de: number;
                  ate: number;
                  isHE: boolean;
                  isTemp: boolean;
                  isLicenca: boolean;
                  expira: string | null;
                };
                const resumo: ResumoItem[] = [];
                const sortedSlots = [...slots].sort(
                  (a, b) =>
                    (a.escola_nome ?? "").localeCompare(b.escola_nome ?? "", "pt-BR") ||
                    (a.turno ?? "").localeCompare(b.turno ?? "") ||
                    (a.dia ?? 0) - (b.dia ?? 0) ||
                    (a.periodo ?? 0) - (b.periodo ?? 0) ||
                    (a.turma_codigo ?? "").localeCompare(b.turma_codigo ?? "", "pt-BR"),
                );
                for (const s of sortedSlots) {
                  const isLicenca =
                    s.titular_matricula === p.matricula || !!s.em_licenca;
                  const last = resumo[resumo.length - 1];
                  const mesmaFaixa =
                    last &&
                    last.escola === (s.escola_nome ?? "—") &&
                    last.turma === (s.turma_codigo ?? "—") &&
                    last.turno === (s.turno ?? "MANHA") &&
                    last.dia === s.dia &&
                    last.isHE === (s.modalidade_cobertura === "HORA_EXTRA") &&
                    last.isTemp === (s.tipo === "TEMPORARIA") &&
                    last.isLicenca === isLicenca &&
                    last.expira === (s.expira_em ?? null) &&
                    last.ate + 1 === s.periodo;
                  if (mesmaFaixa && last) {
                    last.ate = s.periodo;
                  } else {
                    resumo.push({
                      key: `${s.id ?? `${s.dia}-${s.periodo}-${s.turma_codigo}`}`,
                      escola: s.escola_nome ?? "—",
                      turma: s.turma_codigo ?? "—",
                      turno: s.turno ?? "MANHA",
                      dia: s.dia,
                      de: s.periodo,
                      ate: s.periodo,
                      isHE: s.modalidade_cobertura === "HORA_EXTRA",
                      isTemp: s.tipo === "TEMPORARIA",
                      isLicenca,
                      expira: s.expira_em ?? null,
                    });
                  }
                }

                const renderGrid = (slotsGrupo: QuadroSlot[], turno: string) => {
                  const slotMap = new Map(
                    slotsGrupo.map((s) => [`${s.dia}:${s.periodo}`, s])
                  );
                  return (
                    <div className="rounded-lg border border-border bg-white shadow-sm">
                      <div className={`rounded-t-lg px-3 py-2 text-center text-sm font-bold tracking-wide text-white ${TURNO_COLORS[turno] ?? "bg-gray-500"}`}>
                        {TURNO_LABELS[turno] ?? turno}
                      </div>
                      <div className="p-3">
                        <table className="w-full border-collapse text-center text-xs">
                          <thead>
                            <tr>
                              <th className="w-8 border-b border-border bg-slate-50 p-1.5" />
                              {DIAS.map((d) => (
                                <th
                                  key={d.id}
                                  className="border-b border-l border-border bg-slate-50 p-1.5 font-semibold text-muted"
                                >
                                  {d.label.slice(0, 3)}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {PERIODOS.map((periodo) => (
                              <tr key={periodo}>
                                <td className="border-t border-border bg-slate-50 p-1.5 font-medium text-muted">
                                  {periodo}ª
                                </td>
                                {DIAS.map((d) => {
                                  const slot = slotMap.get(`${d.id}:${periodo}`);
                                  const escolaNome = slot?.escola_nome ?? "—";
                                  const colors = escolaColorMap.get(escolaNome);
                                  const isHE = slot?.modalidade_cobertura === "HORA_EXTRA";
                                  const isLicenca =
                                    !!slot &&
                                    (slot.titular_matricula === p.matricula || !!slot.em_licenca);
                                  const turmaLabel = slot?.turma_codigo
                                    ? `${slot.turma_codigo}${isLicenca ? " Lic." : isHE ? " HE" : ""}`
                                    : "";
                                  return (
                                    <td
                                      key={d.id}
                                      className={`h-10 border-l border-t border-border p-0.5 text-[9px] font-semibold leading-tight ${
                                        slot
                                          ? isLicenca && !slot.matricula
                                            ? "bg-fuchsia-200 text-fuchsia-950"
                                            : `${colors?.bg} ${colors?.text}`
                                          : "bg-white"
                                      }`}
                                      title={
                                        slot
                                          ? [
                                              escolaNome,
                                              slot.turma_codigo,
                                              isLicenca ? "Licença" : null,
                                              isHE ? "Hora Extra" : slot.matricula ? "Hora Normal" : null,
                                              slot.expira_em
                                                ? `até ${formatDateBR(String(slot.expira_em).slice(0, 10))}`
                                                : null,
                                            ]
                                              .filter(Boolean)
                                              .join(" · ")
                                          : ""
                                      }
                                    >
                                      {turmaLabel}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                };

                const turnos = ["MANHA", "TARDE", "NOITE"];
                const diaLabel = (id: number) =>
                  DIAS.find((d) => d.id === id)?.label.slice(0, 3) ?? String(id);

                return (
                  <>
                    {escolas.length > 0 && (
                      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                        <span className="font-medium text-muted">Escolas:</span>
                        {escolas.map((escola) => {
                          const colors = escolaColorMap.get(escola);
                          return (
                            <span key={escola} className="inline-flex items-center gap-1.5">
                              <span className={`h-3 w-3 rounded-sm ${colors?.bg} ring-1 ${colors?.ring}`} />
                              <span className="text-foreground">{escola}</span>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {resumo.length > 0 && (
                      <div className="mb-4 flex flex-wrap gap-2">
                        {resumo.map((r) => {
                          const tempos =
                            r.de === r.ate ? `${r.de}ª` : `${r.de}ª–${r.ate}ª`;
                          const expiraTxt = r.expira
                            ? ` · até ${formatDateBR(String(r.expira).slice(0, 10))}`
                            : "";
                          return (
                            <span
                              key={r.key}
                              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-white ${
                                r.isLicenca
                                  ? "bg-fuchsia-600"
                                  : TURNO_COLORS[r.turno] ?? "bg-gray-500"
                              }`}
                              title={`${r.escola} · ${TURNO_LABELS[r.turno] ?? r.turno}${r.isLicenca ? " · Licença" : ""}`}
                            >
                              <strong>{r.turma}</strong>
                              <span className="opacity-90">
                                {diaLabel(r.dia)} {tempos}
                                {r.isLicenca ? " · Licença" : ""}
                                {!r.isLicenca && r.isHE ? " · HE" : ""}
                                {!r.isLicenca && r.isTemp ? " · Temp." : ""}
                                {expiraTxt}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {turnos.map((turno) => {
                        const grupo = slotsPorTurno.get(turno) ?? [];
                        return (
                          <div key={turno}>
                            {renderGrid(grupo, turno)}
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </Panel>
          </div>
        </>
      )}

      {/* TAB: Informações Adicionais */}
      {activeTab === "info" && (
        <div className="mb-6 space-y-6">
          <Panel>
            <h2 className="mb-4 font-display text-xl font-semibold text-brand-dark">
              Dados Cadastrais
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <InfoField label="Matrícula" value={p.matricula} />
              <InfoField label="Nome" value={p.nome} />
              <InfoField label="CGM" value={p.cgm} />
              <InfoField label="Cargo" value={p.cargo} />
              <InfoField label="Cód. Cargo" value={p.cod_cargo} />
              <InfoField label="Função" value={p.funcao} />
              <InfoField label="Padrão" value={p.padrao} />
              <InfoField label="Raça" value={p.raca} />
              <InfoField label="Sexo" value={p.sexo} />
            </div>
          </Panel>

          <Panel>
            <h2 className="mb-4 font-display text-xl font-semibold text-brand-dark">
              Datas
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <InfoField label="Data Admissão" value={formatDateBR(p.dt_admiss)} />
              <InfoField label="Data Início" value={formatDateBR(p.dt_inicio)} />
              <InfoField label="Rescisão" value={formatDateBR(p.rescisao)} />
            </div>
          </Panel>

          <Panel>
            <h2 className="mb-4 font-display text-xl font-semibold text-brand-dark">
              Lotação (Principal)
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <InfoField label="Escola" value={p.escola} />
              <InfoField label="Tipo Hora" value={p.tipohora} />
              <InfoField label="Cód. Lotação" value={p.cod_lotacao} />
              <InfoField label="Lotação" value={p.lotacao} />
            </div>
          </Panel>

          {p.observacao && (
            <Panel>
              <h2 className="mb-2 font-display text-xl font-semibold text-brand-dark">
                Observação
              </h2>
              <p className="text-sm whitespace-pre-wrap">{p.observacao}</p>
            </Panel>
          )}

          {Object.keys(extras).length > 0 && (
            <Panel>
              <h2 className="mb-4 font-display text-xl font-semibold text-brand-dark">
                Campos Extras (Planilha)
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(extras).map(([key, val]) => (
                  <InfoField key={key} label={key} value={String(val ?? "")} />
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* TAB: Lotações */}
      {activeTab === "lotacoes" && (
        <Panel>
          <h2 className="mb-3 font-display text-xl font-semibold text-brand-dark">
            Lotações
          </h2>
          {lotacoes.length === 0 ? (
            <EmptyState message="Nenhuma lotação cadastrada para este professor." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border text-muted">
                  <tr>
                    <th className="px-2 py-2 font-medium">Escola</th>
                    <th className="px-2 py-2 font-medium">Lotação</th>
                    <th className="px-2 py-2 font-medium">Cód. Lotação</th>
                    <th className="px-2 py-2 font-medium">Tipo Hora</th>
                    <th className="px-2 py-2 font-medium">Padrão</th>
                    <th className="px-2 py-2 font-medium">Função</th>
                    <th className="px-2 py-2 font-medium">Data Início</th>
                    <th className="px-2 py-2 font-medium">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {lotacoes.map((l) => (
                    <tr key={l.id} className="border-b border-border/70">
                      <td className="px-2 py-2">{l.escola ?? "—"}</td>
                      <td className="px-2 py-2">{l.lotacao ?? "—"}</td>
                      <td className="px-2 py-2">{l.cod_lotacao ?? "—"}</td>
                      <td className="px-2 py-2">{l.tipohora ?? "—"}</td>
                      <td className="px-2 py-2">{l.padrao ?? "—"}</td>
                      <td className="px-2 py-2">{l.funcao ?? "—"}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {formatDateBR(l.dt_inicio)}
                      </td>
                      <td className="px-2 py-2 max-w-xs">{l.observacao ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">
        {value || "—"}
      </dd>
    </div>
  );
}

function parseExtras(
  extras?: Record<string, string | number> | string | null,
): Record<string, string | number> {
  if (!extras) return {};
  if (typeof extras === "object") return extras;
  try {
    const parsed = JSON.parse(extras);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string | number>;
    }
  } catch {
    /* ignore */
  }
  return {};
}
