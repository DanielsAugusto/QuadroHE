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
  cgm?: string | null;
  dt_admiss?: string | null;
  cod_cargo?: string | null;
  dt_inicio?: string | null;
  rescisao?: string | null;
  escola?: string | null;
  tipohora?: string | null;
  cod_lotacao?: string | null;
  lotacao?: string | null;
  padrao?: string | null;
  observacao?: string | null;
  raca?: string | null;
  sexo?: string | null;
  /** Snapshot completo da linha importada (opcional). */
  extras?: Record<string, string | number> | string | null;
};

export type ProfessorLotacao = {
  id: string;
  matricula: string;
  escola?: string | null;
  tipohora?: string | null;
  cod_lotacao?: string | null;
  lotacao?: string | null;
  padrao?: string | null;
  funcao?: string | null;
  dt_inicio?: string | null;
  observacao?: string | null;
};

export type StatusLicenca = "ABERTA" | "ENCERRADA";

export type ProfessorLicenca = {
  id: string;
  matricula: string;
  professor_nome?: string | null;
  slot_id?: string | null;
  quadro_id?: string | null;
  escola_id?: string | null;
  escola_nome?: string | null;
  turma_codigo?: string | null;
  turno?: Turno | null;
  disciplina_codigo?: string | null;
  dia?: number | null;
  periodo?: number | null;
  inicio: string;
  retorno_previsto: string;
  encerrada_em?: string | null;
  motivo?: string | null;
  status: StatusLicenca;
  /** 1 = ativa no histórico; 0 = inativa (só configuração/ficha). */
  ativo?: number | boolean | null;
  inativado_em?: string | null;
};

export const STATUS_LICENCA_LABEL: Record<StatusLicenca, string> = {
  ABERTA: "Aberta",
  ENCERRADA: "Encerrada",
};

export function isLicencaAtiva(
  l: Pick<ProfessorLicenca, "ativo">,
): boolean {
  if (l.ativo === undefined || l.ativo === null) return true;
  return Number(l.ativo) !== 0;
}

export type Escola = {
  id: string;
  nome: string;
  em_carencias?: number | boolean;
};

export type EscolaLotacao = {
  nome: string;
  total: number;
  hora_extra: number;
  normal: number;
};

export type LotacaoContagemItem = {
  nome: string;
  total: number;
  hora_extra: number;
  normal: number;
};

export type LotacaoContagens = {
  escola: string;
  cargos: LotacaoContagemItem[];
  funcoes: LotacaoContagemItem[];
};

export type LotacaoContagensGeral = {
  total: number;
  normal: number;
  hora_extra: number;
  unicas?: boolean;
  escolas: Array<{
    nome: string;
    total: number;
    normal: number;
    hora_extra: number;
    cargos: LotacaoContagemItem[];
    funcoes: LotacaoContagemItem[];
  }>;
};

export type CarenciaContagemEscola = {
  escola_id: string;
  escola_nome: string;
  abertos: number;
};

export type CarenciaContagemDisciplinaItem = {
  disciplina_id: string;
  codigo: string;
  nome: string;
  abertos: number;
};

export type CarenciaContagemDisciplina = {
  disciplina_id: string;
  codigo: string;
  nome: string;
  abertos: number;
  escolas: CarenciaContagemEscola[];
};

export type CarenciaContagemPorEscola = {
  escola_id: string;
  escola_nome: string;
  abertos: number;
  disciplinas: CarenciaContagemDisciplinaItem[];
};

export type CarenciaContagens = {
  total_abertos: number;
  disciplinas: CarenciaContagemDisciplina[];
  escolas: CarenciaContagemPorEscola[];
};

export type FuncionarioLotacao = {
  id?: string;
  matricula: string;
  nome: string;
  cargo: string | null;
  funcao: string | null;
  tipohora: string | null;
  lotacao: string | null;
  padrao: string | null;
  observacao: string | null;
  dt_admiss: string | null;
  dt_inicio: string | null;
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
  cargo?: string | null;
  funcao?: string | null;
  /** 1 = ativa (relatório); 0 = inativa (só histórico na ficha). */
  ativo?: number | boolean | null;
  inativado_em?: string | null;
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
  /** Lista de turmas deste quadro (um quadro pode ter várias). */
  turmas?: string[];
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
    tipo?: TipoCarencia | null;
    turma_codigo?: string | null;
    modalidade_cobertura?: ModalidadeCobertura | null;
    titular_matricula?: string | null;
  }>;
};

export type TipoCarencia = "REAL" | "TEMPORARIA";
export type ModalidadeCobertura = "NORMAL" | "HORA_EXTRA";

export type QuadroSlot = {
  id: string;
  quadro_id: string;
  dia: number;
  periodo: number;
  matricula: string | null;
  tipo?: TipoCarencia;
  expira_em?: string | null;
  modalidade_cobertura?: ModalidadeCobertura | null;
  /** Titular afastado por licença (mantido enquanto a carência temporária estiver aberta). */
  titular_matricula?: string | null;
  titular_modalidade?: ModalidadeCobertura | null;
  professor_nome?: string | null;
  titular_nome?: string | null;
  turma_codigo?: string;
  turno?: Turno;
  escola_id?: string;
  escola_nome?: string;
  /** Presente na ficha: slot em que o professor é o titular de licença. */
  em_licenca?: boolean | number;
};

export const TIPO_CARENCIA_LABEL: Record<TipoCarencia, string> = {
  REAL: "Real",
  TEMPORARIA: "Temporária",
};

export const MODALIDADE_COBERTURA_LABEL: Record<ModalidadeCobertura, string> = {
  NORMAL: "Hora Normal",
  HORA_EXTRA: "Hora Extra",
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

/** HE ainda considerada ativa no cadastro (não inativada). */
export function isHeAtiva(he: Pick<HoraExtra, "ativo">): boolean {
  if (he.ativo === undefined || he.ativo === null) return true;
  return Number(he.ativo) !== 0;
}

/** HE vigente: ativa, sem término futuro pendente, ou término ainda não passou. */
export function isHeVigente(
  he: Pick<HoraExtra, "inicio" | "termino" | "ativo">,
  hoje = new Date(),
): boolean {
  if (!isHeAtiva(he)) return false;
  const today = todayISO(hoje);
  if (he.inicio && he.inicio > today) return false;
  // Expirada a partir do dia seguinte ao término (= término até ontem)
  if (he.termino && he.termino < today) return false;
  return true;
}

/** HE com término até ontem (já expirou). Inativas não entram aqui. */
export function isHeExpirada(
  he: Pick<HoraExtra, "termino" | "ativo">,
  hoje = new Date(),
): boolean {
  if (!isHeAtiva(he)) return false;
  if (!he.termino) return false;
  return he.termino < todayISO(hoje);
}

export function formatDateBR(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}
