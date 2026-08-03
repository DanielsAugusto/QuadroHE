export type Turno = "MANHA" | "TARDE" | "NOITE";
export type TipoHE = "REAL" | "TEMPORARIA";
export type StatusAlocacao = "ATIVA" | "ENCERRADA" | "CANCELADA";

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type Professor = {
  matricula: string;
  nome: string;
  cargo: string | null;
  funcao: string | null;
};

export type Escola = {
  id: string;
  nome: string;
  em_carencias?: number | boolean;
};

export type Disciplina = {
  id: string;
  nome: string;
  codigo: string;
};

export type HoraExtra = {
  id: string;
  matricula: string;
  disciplina_id: string | null;
  tempos_autorizados: number;
  tipo: TipoHE;
  inicio: string | null;
  termino: string | null;
  memo: string | null;
  observacao: string | null;
  lotacao_origem: string | null;
  unidade?: string | null;
  professor_nome?: string;
  professor_cargo?: string | null;
  professor_funcao?: string | null;
  disciplina_nome?: string;
  disciplina_codigo?: string;
};

export type Alocacao = {
  id: string;
  matricula: string;
  escola_id: string;
  disciplina_id: string | null;
  turno: Turno;
  tempos: number;
  turma_codigo: string | null;
  status: StatusAlocacao;
  professor_nome?: string;
  escola_nome?: string;
  disciplina_nome?: string;
  disciplina_codigo?: string;
};

export type Quadro = {
  id: string;
  escola_id: string;
  turma_codigo: string;
  turno: Turno;
  disciplina_id: string | null;
  observacao: string | null;
  escola_nome?: string;
  disciplina_nome?: string | null;
  disciplina_codigo?: string | null;
  total_slots?: number;
  slots_abertos?: number;
  slots_preview?: Array<{
    dia: number;
    periodo: number;
    matricula: string | null;
  }>;
};

export type TipoCarencia = "REAL" | "TEMPORARIA";

export type QuadroSlot = {
  id: string;
  quadro_id: string;
  dia: number;
  periodo: number;
  matricula: string | null;
  tipo?: TipoCarencia;
  expira_em?: string | null;
  professor_nome?: string | null;
  turma_codigo?: string;
  turno?: Turno;
  escola_id?: string;
  escola_nome?: string;
};

export const TIPO_CARENCIA_LABEL: Record<TipoCarencia, string> = {
  REAL: "Real",
  TEMPORARIA: "Temporária",
};

export type SaldoProfessor = {
  matricula: string;
  nome: string;
  heAutorizada: number;
  temposAlocados: number;
  saldo: number;
};

export const DIAS = [
  { id: 1, label: "SEGUNDA" },
  { id: 2, label: "TERÇA" },
  { id: 3, label: "QUARTA" },
  { id: 4, label: "QUINTA" },
  { id: 5, label: "SEXTA" },
] as const;

export const PERIODOS = [1, 2, 3, 4, 5, 6] as const;

export const TURNO_LABEL: Record<Turno, string> = {
  MANHA: "Manhã",
  TARDE: "Tarde",
  NOITE: "Noite",
};

export const TURNO_HEADER: Record<Turno, string> = {
  MANHA: "bg-[#e67a2e] text-white",
  TARDE: "bg-[#2f6fed] text-white",
  NOITE: "bg-[#6b4fcf] text-white",
};

export const TIPO_HE_LABEL: Record<TipoHE, string> = {
  REAL: "Real",
  TEMPORARIA: "Temporária",
};

export function todayISO(hoje = new Date()): string {
  const y = hoje.getFullYear();
  const m = String(hoje.getMonth() + 1).padStart(2, "0");
  const d = String(hoje.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** HE vigente: sem término, ou término ainda não passou (vale até o dia do término). */
export function isHeVigente(
  he: Pick<HoraExtra, "inicio" | "termino">,
  hoje = new Date(),
): boolean {
  const today = todayISO(hoje);
  if (he.inicio && he.inicio > today) return false;
  // Expirada a partir do dia seguinte ao término (= término até ontem)
  if (he.termino && he.termino < today) return false;
  return true;
}

/** HE com término até ontem (já expirou). */
export function isHeExpirada(
  he: Pick<HoraExtra, "termino">,
  hoje = new Date(),
): boolean {
  if (!he.termino) return false;
  return he.termino < todayISO(hoje);
}

export function formatDateBR(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}
