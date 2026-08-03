import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcrypt";
import { v4 as uuid } from "uuid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "quadrohe.sqlite");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

type CountRow = { c: number };

function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

function migrateQuadroSlotsColumns() {
  ensureColumn("quadro_slots", "tipo", "text not null default 'REAL'");
  ensureColumn("quadro_slots", "expira_em", "text");
}

function migrateEscolasColumns() {
  ensureColumn("escolas", "em_carencias", "integer not null default 0");
}

function migrateHorasExtraColumns() {
  ensureColumn("horas_extra", "unidade", "text not null default 'TEMPOS'");
}

export function initDb() {
  db.exec(`
    create table if not exists usuarios (
      id text primary key,
      email text not null unique,
      senha_hash text not null,
      nome text not null,
      created_at text not null default (datetime('now'))
    );

    create table if not exists professores (
      matricula text primary key,
      nome text not null,
      cargo text,
      funcao text,
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now'))
    );

    create table if not exists escolas (
      id text primary key,
      nome text not null unique,
      em_carencias integer not null default 0 check (em_carencias in (0, 1)),
      created_at text not null default (datetime('now'))
    );

    create table if not exists disciplinas (
      id text primary key,
      nome text not null,
      codigo text not null unique,
      created_at text not null default (datetime('now'))
    );

    create table if not exists horas_extra (
      id text primary key,
      matricula text not null references professores(matricula) on delete cascade,
      disciplina_id text references disciplinas(id) on delete set null,
      tempos_autorizados integer not null check (tempos_autorizados > 0),
      tipo text not null default 'REAL' check (tipo in ('REAL', 'TEMPORARIA')),
      inicio text,
      termino text,
      memo text,
      observacao text,
      lotacao_origem text,
      unidade text not null default 'TEMPOS',
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now'))
    );

    create table if not exists alocacoes (
      id text primary key,
      matricula text not null references professores(matricula) on delete cascade,
      escola_id text not null references escolas(id) on delete cascade,
      disciplina_id text references disciplinas(id) on delete set null,
      turno text not null check (turno in ('MANHA', 'TARDE', 'NOITE')),
      tempos integer not null check (tempos > 0),
      turma_codigo text,
      status text not null default 'ATIVA' check (status in ('ATIVA', 'ENCERRADA', 'CANCELADA')),
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now'))
    );

    create table if not exists quadros (
      id text primary key,
      escola_id text not null references escolas(id) on delete cascade,
      turma_codigo text not null,
      turno text not null check (turno in ('MANHA', 'TARDE', 'NOITE')),
      disciplina_id text references disciplinas(id) on delete set null,
      observacao text,
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now')),
      unique (escola_id, turma_codigo, turno)
    );

    create table if not exists quadro_slots (
      id text primary key,
      quadro_id text not null references quadros(id) on delete cascade,
      dia integer not null check (dia between 1 and 5),
      periodo integer not null check (periodo between 1 and 6),
      matricula text references professores(matricula) on delete set null,
      tipo text not null default 'REAL' check (tipo in ('REAL', 'TEMPORARIA')),
      expira_em text,
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now')),
      unique (quadro_id, dia, periodo)
    );

    create index if not exists idx_quadros_escola on quadros (escola_id);
    create index if not exists idx_quadro_slots_quadro on quadro_slots (quadro_id);
    create index if not exists idx_quadro_slots_matricula on quadro_slots (matricula);
    create index if not exists idx_escolas_em_carencias on escolas (em_carencias);
    create index if not exists idx_horas_extra_matricula on horas_extra (matricula);
    create index if not exists idx_horas_extra_vigencia on horas_extra (inicio, termino);
    create index if not exists idx_alocacoes_matricula_status on alocacoes (matricula, status);
    create index if not exists idx_professores_nome on professores (nome collate nocase);
  `);

  migrateQuadroSlotsColumns();
  migrateEscolasColumns();
  migrateHorasExtraColumns();

  const discCount = db.prepare("select count(*) as c from disciplinas").get() as
    | CountRow
    | undefined;
  if (!discCount || discCount.c === 0) {
    const insert = db.prepare(
      "insert into disciplinas (id, nome, codigo) values (?, ?, ?)",
    );
    const seed = [
      ["Língua Portuguesa", "PT"],
      ["Matemática", "MAT"],
      ["História", "HIS"],
      ["Geografia", "GEO"],
      ["Ciências", "CIE"],
      ["Educação Física", "EF"],
      ["Arte", "ART"],
      ["Inglês", "ING"],
    ];
    for (const [nome, codigo] of seed) {
      insert.run(uuid(), nome, codigo);
    }
  }

  const userCount = db.prepare("select count(*) as c from usuarios").get() as
    | CountRow
    | undefined;
  if (!userCount || userCount.c === 0) {
    const email = process.env.ADMIN_EMAIL || "admin@secretaria.local";
    const password = process.env.ADMIN_PASSWORD || "admin123";
    const hash = bcrypt.hashSync(password, 12);
    db.prepare(
      "insert into usuarios (id, email, senha_hash, nome) values (?, ?, ?, ?)",
    ).run(uuid(), email.toLowerCase(), hash, "Administrador");
    console.log(`Usuário admin criado: ${email}`);
  }
}
