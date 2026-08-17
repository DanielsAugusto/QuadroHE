import bcrypt from "bcrypt";
import { v4 as uuid } from "uuid";
import type { Express } from "express";
import { createApp } from "../../server/app.ts";
import { assertAuthSecrets } from "../../server/auth.ts";
import { db, initDb } from "../../server/db.ts";
import { bcryptRounds } from "../../server/passwordPolicy.ts";

function requireTestSecret(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} não definido — o setup de teste deve gerar o segredo`);
  }
  return value;
}

export const TEST_ADMIN = {
  email: process.env.ADMIN_EMAIL || "admin@test.local",
  password: requireTestSecret("ADMIN_PASSWORD"),
  nome: "Administrador",
};

export const TEST_OPERADOR = {
  email: process.env.TEST_OPERADOR_EMAIL || "operador@test.local",
  password: requireTestSecret("TEST_OPERADOR_PASSWORD"),
  nome: "Operador Teste",
};

const DOMAIN_TABLES = [
  "quadro_slots",
  "quadros",
  "alocacoes",
  "horas_extra",
  "professor_licencas",
  "professor_lotacoes",
  "professores",
  "escolas",
  "audit_logs",
] as const;

let app: Express | null = null;
let operadorHash: string | null = null;
let adminHash: string | null = null;

function seedOperador() {
  const existing = db
    .prepare("select id from usuarios where email = ?")
    .get(TEST_OPERADOR.email);
  if (existing) return;
  if (!operadorHash) {
    operadorHash = bcrypt.hashSync(TEST_OPERADOR.password, bcryptRounds());
  }
  db.prepare(
    `insert into usuarios (id, email, senha_hash, nome, papel, ativo, token_version)
     values (?, ?, ?, ?, 'operador', 1, 1)`,
  ).run(uuid(), TEST_OPERADOR.email, operadorHash, TEST_OPERADOR.nome);
}

export function getTestApp(): Express {
  if (!app) {
    assertAuthSecrets();
    initDb();
    const admin = db
      .prepare("select senha_hash from usuarios where email = ?")
      .get(TEST_ADMIN.email) as { senha_hash: string } | undefined;
    adminHash = admin?.senha_hash ?? null;
    seedOperador();
    app = createApp();
  }
  return app;
}

/** Isola cada teste: apaga dados de negócio e restaura usuários seed. */
export function resetTestData() {
  getTestApp();
  db.exec("PRAGMA foreign_keys = OFF;");
  for (const table of DOMAIN_TABLES) {
    db.exec(`delete from ${table}`);
  }
  db.prepare("delete from usuarios where email not in (?, ?)").run(
    TEST_ADMIN.email,
    TEST_OPERADOR.email,
  );
  db.exec("delete from login_lockouts");
  db.prepare(
    `update usuarios
     set ativo = 1,
         token_version = 1,
         papel = 'admin',
         senha_hash = coalesce(?, senha_hash),
         mfa_secret = null,
         mfa_enabled = 0,
         updated_at = datetime('now')
     where email = ?`,
  ).run(adminHash, TEST_ADMIN.email);
  db.prepare(
    `update usuarios
     set ativo = 1, token_version = 1, papel = 'operador',
         mfa_secret = null, mfa_enabled = 0,
         updated_at = datetime('now')
     where email = ?`,
  ).run(TEST_OPERADOR.email);
  db.exec("PRAGMA foreign_keys = ON;");
  seedOperador();
}

export function getUsuarioId(email: string): string {
  const row = db
    .prepare("select id from usuarios where email = ?")
    .get(email) as { id: string } | undefined;
  if (!row) throw new Error(`Usuário não encontrado: ${email}`);
  return row.id;
}

export function countTable(table: string): number {
  const row = db.prepare(`select count(*) as c from ${table}`).get() as {
    c: number;
  };
  return row.c;
}
