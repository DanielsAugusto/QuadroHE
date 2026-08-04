import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
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
  TIPO_HE_LABEL,
  TURNO_LABEL,
  formatDateBR,
  isHeExpirada,
  isHeVigente,
  type Alocacao,
  type HoraExtra,
  type Professor,
  type QuadroSlot,
} from "@/lib/types";

type Ficha = {
  professor: Professor;
  horas_extra: HoraExtra[];
  alocacoes: Alocacao[];
  slots: QuadroSlot[];
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

export function FichaProfessorPage() {
  const { matricula } = useParams();
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

  const { professor: p, horas_extra: hes, alocacoes: alocs, slots = [] } = data;
  const heAutorizada = hes
    .filter((h) => isHeVigente(h))
    .reduce((acc, h) => acc + h.tempos_autorizados, 0);
  const heExpirada = hes.filter((h) => isHeExpirada(h)).length;
  const temposAloc =
    alocs.filter((a) => a.status === "ATIVA").reduce((acc, a) => acc + a.tempos, 0) +
    slots.length;
  const saldo = heAutorizada - temposAloc;

  return (
    <div>
      <PageHeader
        title={p.nome}
        description={`Matrícula ${p.matricula}${p.funcao ? ` · ${p.funcao}` : ""}${p.cargo ? ` · ${p.cargo}` : ""}`}
        actions={<VoltarButton />}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="HE autorizada vigente" value={heAutorizada} tone="ok" />
        <StatCard
          label="HE expirada"
          value={heExpirada}
          tone={heExpirada > 0 ? "danger" : "default"}
        />
        <StatCard label="Tempos alocados" value={temposAloc} />
        <StatCard
          label="Saldo (HE − alocado)"
          value={saldo}
          tone={saldo < 0 ? "danger" : saldo === 0 ? "ok" : "warn"}
        />
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
                      <td className="px-2 py-2">{p.cargo ?? "—"}</td>
                      <td className="px-2 py-2">{p.funcao ?? "—"}</td>
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
            Quadros / turmas cobertas
          </h2>
          {slots.length === 0 ? (
            <EmptyState message="Nenhum horário atribuído a este professor." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border text-muted">
                  <tr>
                    <th className="px-2 py-2 font-medium">Escola</th>
                    <th className="px-2 py-2 font-medium">Turma</th>
                    <th className="px-2 py-2 font-medium">Turno</th>
                    <th className="px-2 py-2 font-medium">Dia</th>
                    <th className="px-2 py-2 font-medium">Período</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((s) => (
                    <tr key={s.id} className="border-b border-border/70">
                      <td className="px-2 py-2">
                        {s.escola_id ? (
                          <Link
                            to={`/carencias/${s.escola_id}/${s.quadro_id}`}
                            className="text-brand underline-offset-2 hover:underline"
                          >
                            {s.escola_nome ?? "—"}
                          </Link>
                        ) : (
                          (s.escola_nome ?? "—")
                        )}
                      </td>
                      <td className="px-2 py-2 font-medium">
                        {s.turma_codigo ?? "—"}
                      </td>
                      <td className="px-2 py-2">
                        {s.turno ? TURNO_LABEL[s.turno] : "—"}
                      </td>
                      <td className="px-2 py-2">
                        {DIAS.find((d) => d.id === s.dia)?.label ?? s.dia}
                      </td>
                      <td className="px-2 py-2">{s.periodo}ª</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
