import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcrypt";
import { v4 as uuid } from "uuid";
import {
  repairMojibakeText,
  repairMojibakeValue,
} from "../src/lib/textEncoding.ts";

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

/** Permite mesma turma+turno com disciplinas diferentes. */
function migrateQuadrosUniqueComDisciplina() {
  const row = db
    .prepare(
      `select sql from sqlite_master where type = 'table' and name = 'quadros'`,
    )
    .get() as { sql: string } | undefined;
  if (!row?.sql) return;
  if (
    /unique\s*\(\s*escola_id\s*,\s*turma_codigo\s*,\s*turno\s*,\s*disciplina_id\s*\)/i.test(
      row.sql,
    )
  ) {
    return;
  }
  if (
    !/unique\s*\(\s*escola_id\s*,\s*turma_codigo\s*,\s*turno\s*\)/i.test(row.sql)
  ) {
    return;
  }

  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("BEGIN");
  try {
    db.exec(`
      create table quadros__new (
        id text primary key,
        escola_id text not null references escolas(id) on delete cascade,
        turma_codigo text not null,
        turno text not null check (turno in ('MANHA', 'TARDE', 'NOITE')),
        disciplina_id text references disciplinas(id) on delete set null,
        observacao text,
        created_at text not null default (datetime('now')),
        updated_at text not null default (datetime('now')),
        unique (escola_id, turma_codigo, turno, disciplina_id)
      );
      insert into quadros__new
        (id, escola_id, turma_codigo, turno, disciplina_id, observacao, created_at, updated_at)
      select id, escola_id, turma_codigo, turno, disciplina_id, observacao, created_at, updated_at
      from quadros;
      drop table quadros;
      alter table quadros__new rename to quadros;
      create index if not exists idx_quadros_escola on quadros (escola_id);
    `);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

function migrateEscolasColumns() {
  ensureColumn("escolas", "em_carencias", "integer not null default 0");
}

function migrateProfessoresColumns() {
  ensureColumn("professores", "extras", "text");
  ensureColumn("professores", "cgm", "text");
  ensureColumn("professores", "dt_admiss", "text");
  ensureColumn("professores", "cod_cargo", "text");
  ensureColumn("professores", "dt_inicio", "text");
  ensureColumn("professores", "rescisao", "text");
  ensureColumn("professores", "escola", "text");
  ensureColumn("professores", "tipohora", "text");
  ensureColumn("professores", "cod_lotacao", "text");
  ensureColumn("professores", "lotacao", "text");
  ensureColumn("professores", "padrao", "text");
  ensureColumn("professores", "observacao", "text");
  ensureColumn("professores", "raca", "text");
  ensureColumn("professores", "sexo", "text");
}

function repairProfessoresEncoding() {
  const marker = "\u00ef\u00bf\u00bd";
  const needs = db
    .prepare(
      `select count(*) as c from professores
       where instr(ifnull(escola,''), ?) > 0
          or instr(ifnull(nome,''), ?) > 0
          or instr(ifnull(funcao,''), ?) > 0
          or instr(ifnull(lotacao,''), ?) > 0
          or instr(ifnull(cargo,''), ?) > 0
          or instr(ifnull(extras,''), ?) > 0
          or instr(ifnull(observacao,''), ?) > 0`,
    )
    .get(marker, marker, marker, marker, marker, marker, marker) as
    | CountRow
    | undefined;

  if (!needs || needs.c === 0) return;

  const rows = db
    .prepare(
      `select matricula, nome, cargo, funcao, escola, lotacao, observacao, extras
       from professores
       where instr(ifnull(escola,''), ?) > 0
          or instr(ifnull(nome,''), ?) > 0
          or instr(ifnull(funcao,''), ?) > 0
          or instr(ifnull(lotacao,''), ?) > 0
          or instr(ifnull(cargo,''), ?) > 0
          or instr(ifnull(extras,''), ?) > 0
          or instr(ifnull(observacao,''), ?) > 0`,
    )
    .all(marker, marker, marker, marker, marker, marker, marker) as Array<{
    matricula: string;
    nome: string;
    cargo: string | null;
    funcao: string | null;
    escola: string | null;
    lotacao: string | null;
    observacao: string | null;
    extras: string | null;
  }>;

  const update = db.prepare(
    `update professores set
       nome = ?, cargo = ?, funcao = ?, escola = ?, lotacao = ?,
       observacao = ?, extras = ?, updated_at = datetime('now')
     where matricula = ?`,
  );

  let fixed = 0;
  db.exec("BEGIN");
  try {
    for (const row of rows) {
      let extras: string | null = row.extras;
      if (extras) {
        try {
          const parsed = JSON.parse(extras) as unknown;
          extras = JSON.stringify(repairMojibakeValue(parsed));
        } catch {
          extras = repairMojibakeText(extras);
        }
      }
      update.run(
        repairMojibakeText(row.nome) ?? row.nome,
        repairMojibakeText(row.cargo),
        repairMojibakeText(row.funcao),
        repairMojibakeText(row.escola),
        repairMojibakeText(row.lotacao),
        repairMojibakeText(row.observacao),
        extras,
        row.matricula,
      );
      fixed += 1;
    }
    db.exec("COMMIT");
    console.log(`Encoding reparado em ${fixed} professor(es).`);
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.error("Falha ao reparar encoding:", err);
  }
}

function migrateHorasExtraColumns() {
  ensureColumn("horas_extra", "unidade", "text not null default 'TEMPOS'");
}

/** Copia lotações legadas da tabela professores (1x) para professor_lotacoes. */
function migrateProfessorLotacoesFromProfessores() {
  const count = db
    .prepare("select count(*) as c from professor_lotacoes")
    .get() as CountRow | undefined;
  if (count && count.c > 0) return;

  const rows = db
    .prepare(
      `select matricula, escola, tipohora, cod_lotacao, lotacao, padrao, funcao, dt_inicio, observacao
       from professores
       where trim(ifnull(escola,'')) != ''
          or trim(ifnull(tipohora,'')) != ''
          or trim(ifnull(lotacao,'')) != ''`,
    )
    .all() as Array<{
    matricula: string;
    escola: string | null;
    tipohora: string | null;
    cod_lotacao: string | null;
    lotacao: string | null;
    padrao: string | null;
    funcao: string | null;
    dt_inicio: string | null;
    observacao: string | null;
  }>;

  if (rows.length === 0) return;

  const insert = db.prepare(
    `insert or ignore into professor_lotacoes (
       id, matricula, escola, tipohora, cod_lotacao, lotacao, padrao, funcao, dt_inicio, observacao
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  db.exec("BEGIN");
  try {
    for (const row of rows) {
      insert.run(
        uuid(),
        row.matricula,
        row.escola,
        row.tipohora,
        row.cod_lotacao,
        row.lotacao,
        row.padrao,
        row.funcao,
        row.dt_inicio,
        row.observacao,
      );
    }
    db.exec("COMMIT");
    console.log(
      `Migradas ${rows.length} lotação(ões) legadas para professor_lotacoes.`,
    );
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.error("Falha ao migrar lotações:", err);
  }
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
      cgm text,
      dt_admiss text,
      cod_cargo text,
      dt_inicio text,
      rescisao text,
      escola text,
      tipohora text,
      cod_lotacao text,
      lotacao text,
      padrao text,
      observacao text,
      raca text,
      sexo text,
      extras text,
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
      unique (escola_id, turma_codigo, turno, disciplina_id)
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

    create table if not exists professor_lotacoes (
      id text primary key,
      matricula text not null references professores(matricula) on delete cascade,
      escola text,
      tipohora text,
      cod_lotacao text,
      lotacao text,
      padrao text,
      funcao text,
      dt_inicio text,
      observacao text,
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now'))
    );

    create index if not exists idx_prof_lotacoes_matricula on professor_lotacoes (matricula);
    create index if not exists idx_prof_lotacoes_escola on professor_lotacoes (escola);
    create unique index if not exists idx_prof_lotacoes_natural on professor_lotacoes (
      matricula,
      ifnull(tipohora, ''),
      ifnull(escola, ''),
      ifnull(cod_lotacao, ''),
      ifnull(lotacao, '')
    );
  `);

  migrateQuadroSlotsColumns();
  migrateEscolasColumns();
  migrateProfessoresColumns();
  migrateHorasExtraColumns();
  migrateQuadrosUniqueComDisciplina();
  repairProfessoresEncoding();
  migrateProfessorLotacoesFromProfessores();

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
