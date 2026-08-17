import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  IconCloseButton,
  PageHeader,
  Panel,
  StatCard,
  btnSecondary,
} from "@/components/ui";
import { api } from "@/lib/api";
import {
  DIAS,
  PERIODOS,
  STATUS_LICENCA_LABEL,
  TIPO_HE_LABEL,
  TURNO_LABEL,
  formatDateBR,
  isHeAtiva,
  isHeExpirada,
  isHeVigente,
  isLicencaAtiva,
  type Alocacao,
  type HoraExtra,
  type Professor,
  type ProfessorLicenca,
  type ProfessorLotacao,
  type QuadroSlot,
} from "@/lib/types";

type Ficha = {
  professor: Professor;
  horas_extra: HoraExtra[];
  alocacoes: Alocacao[];
  slots: QuadroSlot[];
  lotacoes: ProfessorLotacao[];
  licencas: ProfessorLicenca[];
};

type LocationState = {
  from?: string;
};

/** HE na ficha: professor atribuído com modalidade Hora Extra. */
function isSlotHoraExtra(s: QuadroSlot, matricula: string) {
  return s.matricula === matricula && s.modalidade_cobertura === "HORA_EXTRA";
}

/** Titular afastado nestes horários (licença aberta). */
function isTitularEmLicenca(s: QuadroSlot, matricula: string) {
  return s.titular_matricula === matricula || Boolean(s.em_licenca);
}

function VoltarButton() {
  const navigate = useNavigate();
  const location = useLocation();
  /** Mantém a origem da navegação mesmo se a URL da ficha mudar (abas). */
  const fromRef = useRef<string | null>(
    typeof (location.state as LocationState | null)?.from === "string"
      ? ((location.state as LocationState).from as string)
      : null,
  );

  return (
    <button
      type="button"
      className={btnSecondary}
      onClick={() => {
        if (fromRef.current) {
          navigate(fromRef.current);
          return;
        }
        navigate(-1);
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
  { id: "licencas", label: "Licenças" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function FichaProfessorPage() {
  const { matricula } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as TabId | null;
  const activeTab: TabId = TABS.some((t) => t.id === tabParam) ? tabParam! : "resumo";
  const [data, setData] = useState<Ficha | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingInativarLicenca, setPendingInativarLicenca] = useState<{
    ids: string[];
    label: string;
  } | null>(null);
  const [savingLicenca, setSavingLicenca] = useState(false);

  const load = useCallback(async () => {
    if (!matricula) return;
    try {
      const ficha = await api<Ficha>(`/professores/${matricula}`);
      setData(ficha);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    }
  }, [matricula]);

  useEffect(() => {
    void load();
  }, [load]);

  function setTab(tab: TabId) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", tab);
        return next;
      },
      { replace: true },
    );
  }

  if (!data && error) {
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

  const {
    professor: p,
    horas_extra: hes,
    alocacoes: alocs,
    slots = [],
    lotacoes = [],
    licencas = [],
  } = data;
  const heAutorizada = hes
    .filter((h) => isHeVigente(h))
    .reduce((acc, h) => acc + h.tempos_autorizados, 0);
  const heExpirada = hes.filter((h) => isHeExpirada(h)).length;
  const slotsComoCobertura = slots.filter((s) => s.matricula === p.matricula);
  const slotsEmLicenca = slots.filter((s) =>
    isTitularEmLicenca(s, p.matricula),
  );
  const slotsHoraExtra = slotsComoCobertura.filter((s) =>
    isSlotHoraExtra(s, p.matricula),
  );
  const slotsHoraNormal = slotsComoCobertura.filter(
    (s) => !isSlotHoraExtra(s, p.matricula),
  );
  const temposAloc =
    alocs.filter((a) => a.status === "ATIVA").reduce((acc, a) => acc + a.tempos, 0) +
    slotsHoraExtra.length;
  const saldo = heAutorizada - temposAloc;

  const extras = parseExtras(p.extras);

  async function confirmarInativarLicenca() {
    if (!pendingInativarLicenca) return;
    setSavingLicenca(true);
    try {
      await api("/licencas/inativar", {
        method: "POST",
        body: JSON.stringify({ ids: pendingInativarLicenca.ids }),
      });
      setPendingInativarLicenca(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao inativar");
      setPendingInativarLicenca(null);
    } finally {
      setSavingLicenca(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={p.nome}
        description={`Matrícula ${p.matricula}${p.funcao ? ` · ${p.funcao}` : ""}${p.cargo ? ` · ${p.cargo}` : ""}`}
        actions={<VoltarButton />}
      />
      <ErrorBanner message={error} />

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
                        <th className="px-2 py-2 font-medium">Situação</th>
                        <th className="px-2 py-2 font-medium">Início</th>
                        <th className="px-2 py-2 font-medium">Término</th>
                        <th className="px-2 py-2 font-medium">Disciplina</th>
                        <th className="px-2 py-2 font-medium">Lotação</th>
                        <th className="px-2 py-2 font-medium">Memo</th>
                        <th className="px-2 py-2 font-medium">Observação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hes.map((h) => {
                        const ativa = isHeAtiva(h);
                        return (
                        <tr
                          key={h.id}
                          className={`border-b border-border/70 ${ativa ? "" : "bg-background/80 text-muted"}`}
                        >
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
                            {ativa ? (
                              <span className="font-medium text-emerald-700">Ativa</span>
                            ) : (
                              <span
                                className="font-medium text-amber-800"
                                title={
                                  h.inativado_em
                                    ? `Inativada em ${formatDateBR(String(h.inativado_em).slice(0, 10))}`
                                    : "Inativada"
                                }
                              >
                                Inativa
                              </span>
                            )}
                          </td>
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
                        );
                      })}
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

                // Resumo compacto: totais de HE (modalidade) e licença (titular)
                let temposHE = 0;
                let temposLicenca = 0;
                const expiracoesHE = new Set<string>();
                const expiracoesLicenca = new Set<string>();
                for (const s of slots) {
                  if (isSlotHoraExtra(s, p.matricula)) {
                    temposHE += 1;
                    if (s.expira_em) expiracoesHE.add(String(s.expira_em).slice(0, 10));
                  } else if (isTitularEmLicenca(s, p.matricula)) {
                    temposLicenca += 1;
                    if (s.expira_em) {
                      expiracoesLicenca.add(String(s.expira_em).slice(0, 10));
                    }
                  }
                }
                const formatExpiras = (set: Set<string>) => {
                  const list = [...set].sort();
                  if (list.length === 0) return "";
                  if (list.length === 1) {
                    return ` · até ${formatDateBR(list[0])}`;
                  }
                  return ` · até ${formatDateBR(list[0])}…`;
                };

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
                                  const isHE =
                                    !!slot && isSlotHoraExtra(slot, p.matricula);
                                  const isLicenca =
                                    !!slot && isTitularEmLicenca(slot, p.matricula);
                                  const turmaLabel = slot?.turma_codigo
                                    ? `${slot.turma_codigo}${isLicenca && slot.matricula !== p.matricula ? " Lic." : isHE ? " HE" : ""}`
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
                                              isLicenca && slot.matricula !== p.matricula
                                                ? "Licença (titular)"
                                                : null,
                                              isHE ? "Hora Extra" : null,
                                              !isLicenca &&
                                              !isHE &&
                                              slot.matricula
                                                ? "Cobertura"
                                                : null,
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

                    {(temposHE > 0 || temposLicenca > 0) && (
                      <div className="mb-4 flex flex-wrap gap-2">
                        {temposHE > 0 ? (
                          <span className="inline-flex items-center rounded-md bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-950 ring-1 ring-amber-200">
                            HE · {temposHE} tempo{temposHE === 1 ? "" : "s"}
                            {formatExpiras(expiracoesHE)}
                          </span>
                        ) : null}
                        {temposLicenca > 0 ? (
                          <span className="inline-flex items-center rounded-md bg-fuchsia-100 px-2.5 py-1 text-xs font-medium text-fuchsia-950 ring-1 ring-fuchsia-200">
                            Licença · {temposLicenca} tempo
                            {temposLicenca === 1 ? "" : "s"}
                            {formatExpiras(expiracoesLicenca)}
                          </span>
                        ) : null}
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
              <InfoField label="Data Admissão" value={formatDateBR(p.dt_admiss)} />
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
              <InfoField label="Data Início" value={formatDateBR(p.dt_inicio)} />
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

      {/* TAB: Licenças */}
      {activeTab === "licencas" && (
        <Panel>
          <h2 className="mb-1 font-display text-xl font-semibold text-brand-dark">
            Licenças
          </h2>
          <p className="mb-3 text-sm text-muted">
            Histórico das licenças. Horários da mesma data aparecem agrupados. O
            X inativa; exclusão permanente fica em Configuração → Licenças.
          </p>
          {licencas.length === 0 ? (
            <EmptyState message="Nenhuma licença registrada para este professor." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border text-muted">
                  <tr>
                    <th className="px-2 py-2 font-medium">Situação</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Motivo</th>
                    <th className="px-2 py-2 font-medium">Início</th>
                    <th className="px-2 py-2 font-medium">Retorno previsto</th>
                    <th className="px-2 py-2 font-medium">Encerrada em</th>
                    <th className="px-2 py-2 font-medium">Escola</th>
                    <th className="px-2 py-2 font-medium">Turmas</th>
                    <th className="px-2 py-2 font-medium">Turnos</th>
                    <th className="px-2 py-2 font-medium">Disc.</th>
                    <th className="px-2 py-2 font-medium">Tempos</th>
                    <th className="px-2 py-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {agruparLicencas(licencas).map((l) => (
                    <tr
                      key={l.key}
                      className={`border-b border-border/70 ${
                        l.ativa ? "" : "bg-amber-50/70 text-muted"
                      }`}
                    >
                      <td className="px-2 py-2 whitespace-nowrap">
                        {l.ativa ? (
                          <span className="inline-flex rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                            Ativa
                          </span>
                        ) : (
                          <span
                            className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-200"
                            title={
                              l.inativado_em
                                ? `Inativada em ${formatDateBR(String(l.inativado_em).slice(0, 10))}`
                                : "Inativada"
                            }
                          >
                            Inativa
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                            l.status === "ABERTA"
                              ? "bg-fuchsia-100 text-fuchsia-900"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {STATUS_LICENCA_LABEL[l.status]}
                        </span>
                      </td>
                      <td className="px-2 py-2 max-w-[12rem]" title={l.motivo || undefined}>
                        {l.motivo || "—"}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {formatDateBR(l.inicio)}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {formatDateBR(l.retorno_previsto)}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {formatDateBR(l.encerrada_em)}
                      </td>
                      <td className="px-2 py-2">{l.escolas || "—"}</td>
                      <td className="px-2 py-2">{l.turmas || "—"}</td>
                      <td className="px-2 py-2">{l.turnos || "—"}</td>
                      <td className="px-2 py-2">{l.disciplinas || "—"}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{l.tempos}</td>
                      <td className="px-2 py-2">
                        {l.ativa ? (
                          <IconCloseButton
                            label="Inativar licença"
                            title="Inativar"
                            onClick={() =>
                              setPendingInativarLicenca({
                                ids: l.ids,
                                label: `${formatDateBR(l.inicio)} → ${formatDateBR(l.retorno_previsto)} · ${l.tempos} tempo(s)`,
                              })
                            }
                          />
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      <ConfirmDialog
        open={!!pendingInativarLicenca}
        title="Inativar licença"
        message={
          pendingInativarLicenca
            ? `Inativar a licença ${pendingInativarLicenca.label}? Ela fica no histórico como inativa. Para excluir de vez, use Configuração → Licenças.`
            : ""
        }
        confirmLabel="Inativar"
        loading={savingLicenca}
        onConfirm={() => void confirmarInativarLicenca()}
        onClose={() => {
          if (!savingLicenca) setPendingInativarLicenca(null);
        }}
      />
    </div>
  );
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
}

/** Agrupa horários da mesma licença (mesmas datas/status/motivo/ativo) em uma linha. */
function agruparLicencas(licencas: ProfessorLicenca[]) {
  const groups = new Map<
    string,
    {
      key: string;
      ids: string[];
      status: ProfessorLicenca["status"];
      inicio: string;
      retorno_previsto: string;
      encerrada_em: string | null | undefined;
      motivo: string | null | undefined;
      inativado_em: string | null | undefined;
      ativa: boolean;
      escolas: string[];
      turmas: string[];
      turnos: string[];
      disciplinas: string[];
      tempos: number;
    }
  >();

  for (const l of licencas) {
    const ativa = isLicencaAtiva(l);
    const key = [
      l.status,
      l.inicio,
      l.retorno_previsto,
      l.encerrada_em ?? "",
      l.motivo ?? "",
      ativa ? "1" : "0",
    ].join("|");
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        ids: [l.id],
        status: l.status,
        inicio: l.inicio,
        retorno_previsto: l.retorno_previsto,
        encerrada_em: l.encerrada_em,
        motivo: l.motivo,
        inativado_em: l.inativado_em,
        ativa,
        escolas: uniqueSorted([l.escola_nome]),
        turmas: uniqueSorted([l.turma_codigo]),
        turnos: uniqueSorted([l.turno ? TURNO_LABEL[l.turno] : null]),
        disciplinas: uniqueSorted([l.disciplina_codigo]),
        tempos: 1,
      });
      continue;
    }
    existing.ids.push(l.id);
    if (!existing.inativado_em && l.inativado_em) {
      existing.inativado_em = l.inativado_em;
    }
    if (!existing.motivo && l.motivo) {
      existing.motivo = l.motivo;
    }
    existing.escolas = uniqueSorted([...existing.escolas, l.escola_nome]);
    existing.turmas = uniqueSorted([...existing.turmas, l.turma_codigo]);
    existing.turnos = uniqueSorted([
      ...existing.turnos,
      l.turno ? TURNO_LABEL[l.turno] : null,
    ]);
    existing.disciplinas = uniqueSorted([
      ...existing.disciplinas,
      l.disciplina_codigo,
    ]);
    existing.tempos += 1;
  }

  return [...groups.values()].map((g) => ({
    ...g,
    escolas: g.escolas.join(" · "),
    turmas: g.turmas.join(" · "),
    turnos: g.turnos.join(" · "),
    disciplinas: g.disciplinas.join(" · "),
  }));
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
