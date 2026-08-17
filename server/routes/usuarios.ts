import { Router } from "express";
import bcrypt from "bcrypt";
import { v4 as uuid } from "uuid";
import { writeAuditLog } from "../audit.js";
import {
  bumpTokenVersion,
  normalizePapel,
  requireAdmin,
  requireAuth,
} from "../auth.js";
import { db } from "../db.js";
import { bcryptRounds } from "../passwordPolicy.js";

export const usuariosRouter = Router();
usuariosRouter.use(requireAuth, requireAdmin);

type UsuarioRow = {
  id: string;
  email: string;
  nome: string;
  papel: string;
  ativo: number;
  created_at: string;
  updated_at: string | null;
  mfa_enabled?: number | null;
};

function publicUser(row: UsuarioRow) {
  return {
    id: row.id,
    email: row.email,
    nome: row.nome,
    papel: normalizePapel(row.papel),
    ativo: Number(row.ativo ?? 1) !== 0,
    mfa_enabled: Number(row.mfa_enabled ?? 0) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

usuariosRouter.get("/", (_req, res) => {
  const rows = db
    .prepare(
      `select id, email, nome, papel, ativo, created_at, updated_at,
              ifnull(mfa_enabled, 0) as mfa_enabled
       from usuarios
       order by nome collate nocase, email collate nocase`,
    )
    .all() as UsuarioRow[];
  res.json(rows.map(publicUser));
});

usuariosRouter.post("/", async (req, res) => {
  const nome = String(req.body?.nome ?? "").trim();
  const email = String(req.body?.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(req.body?.password ?? "");
  const papel = normalizePapel(req.body?.papel);

  if (!nome || !email || !password) {
    return res.status(400).json({ error: "Informe nome, e-mail e senha" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Senha deve ter ao menos 8 caracteres" });
  }
  if (!email.includes("@")) {
    return res.status(400).json({ error: "E-mail inválido" });
  }

  const exists = db
    .prepare("select id from usuarios where email = ?")
    .get(email);
  if (exists) {
    return res.status(409).json({ error: "Já existe usuário com este e-mail" });
  }

  const id = uuid();
  const hash = await bcrypt.hash(password, bcryptRounds());
  db.prepare(
    `insert into usuarios (id, email, senha_hash, nome, papel, ativo, updated_at)
     values (?, ?, ?, ?, ?, 1, datetime('now'))`,
  ).run(id, email, hash, nome, papel);

  writeAuditLog({
    req,
    categoria: "sistema",
    acao: "criar",
    entidade: "usuarios",
    entidade_id: id,
    resumo: `Criou usuário ${nome} (${email}) · ${papel}`,
    detalhes: { email, papel },
  });

  const row = db
    .prepare(
      `select id, email, nome, papel, ativo, created_at, updated_at,
              ifnull(mfa_enabled, 0) as mfa_enabled
       from usuarios where id = ?`,
    )
    .get(id) as UsuarioRow;

  return res.status(201).json(publicUser(row));
});

usuariosRouter.put("/:id", async (req, res) => {
  const id = req.params.id;
  const existing = db
    .prepare(
      `select id, email, nome, papel, ativo, created_at, updated_at,
              ifnull(mfa_enabled, 0) as mfa_enabled
       from usuarios where id = ?`,
    )
    .get(id) as UsuarioRow | undefined;
  if (!existing) {
    return res.status(404).json({ error: "Usuário não encontrado" });
  }

  const nome = String(req.body?.nome ?? existing.nome).trim();
  const email = String(req.body?.email ?? existing.email)
    .trim()
    .toLowerCase();
  const papel = normalizePapel(req.body?.papel ?? existing.papel);
  const password =
    req.body?.password !== undefined && req.body?.password !== null
      ? String(req.body.password)
      : "";

  if (!nome || !email) {
    return res.status(400).json({ error: "Informe nome e e-mail" });
  }
  if (!email.includes("@")) {
    return res.status(400).json({ error: "E-mail inválido" });
  }
  if (password && password.length < 8) {
    return res.status(400).json({ error: "Senha deve ter ao menos 8 caracteres" });
  }

  const dup = db
    .prepare("select id from usuarios where email = ? and id != ?")
    .get(email, id);
  if (dup) {
    return res.status(409).json({ error: "Já existe usuário com este e-mail" });
  }

  // Não permitir remover o último admin
  if (
    normalizePapel(existing.papel) === "admin" &&
    papel !== "admin" &&
    Number(existing.ativo ?? 1) !== 0
  ) {
    const admins = db
      .prepare(
        `select count(*) as c from usuarios
         where papel = 'admin' and ifnull(ativo, 1) = 1 and id != ?`,
      )
      .get(id) as { c: number };
    if (admins.c === 0) {
      return res.status(400).json({
        error: "Não é possível remover o último administrador ativo",
      });
    }
  }

  const papelAnterior = normalizePapel(existing.papel);
  if (password) {
    const hash = await bcrypt.hash(password, bcryptRounds());
    db.prepare(
      `update usuarios
       set nome = ?, email = ?, papel = ?, senha_hash = ?, updated_at = datetime('now')
       where id = ?`,
    ).run(nome, email, papel, hash, id);
    bumpTokenVersion(id);
  } else {
    db.prepare(
      `update usuarios
       set nome = ?, email = ?, papel = ?, updated_at = datetime('now')
       where id = ?`,
    ).run(nome, email, papel, id);
    if (papelAnterior !== papel) {
      bumpTokenVersion(id);
    }
  }

  writeAuditLog({
    req,
    categoria: "sistema",
    acao: "editar",
    entidade: "usuarios",
    entidade_id: id,
    resumo: `Editou usuário ${nome} (${email}) · ${papel}${password ? " · senha alterada" : ""}`,
    detalhes: { email, papel, senha_alterada: Boolean(password) },
  });

  const row = db
    .prepare(
      `select id, email, nome, papel, ativo, created_at, updated_at,
              ifnull(mfa_enabled, 0) as mfa_enabled
       from usuarios where id = ?`,
    )
    .get(id) as UsuarioRow;

  return res.json(publicUser(row));
});

usuariosRouter.post("/:id/inativar", (req, res) => {
  const id = req.params.id;
  if (req.user?.id === id) {
    return res.status(400).json({ error: "Você não pode inativar o próprio usuário" });
  }

  const existing = db
    .prepare(`select id, email, nome, papel, ativo from usuarios where id = ?`)
    .get(id) as
    | { id: string; email: string; nome: string; papel: string; ativo: number }
    | undefined;
  if (!existing) {
    return res.status(404).json({ error: "Usuário não encontrado" });
  }
  if (Number(existing.ativo ?? 1) === 0) {
    return res.json({ ok: true, already: true });
  }

  if (normalizePapel(existing.papel) === "admin") {
    const admins = db
      .prepare(
        `select count(*) as c from usuarios
         where papel = 'admin' and ifnull(ativo, 1) = 1 and id != ?`,
      )
      .get(id) as { c: number };
    if (admins.c === 0) {
      return res.status(400).json({
        error: "Não é possível inativar o último administrador ativo",
      });
    }
  }

  db.prepare(
    `update usuarios set ativo = 0, updated_at = datetime('now') where id = ?`,
  ).run(id);
  bumpTokenVersion(id);

  writeAuditLog({
    req,
    categoria: "sistema",
    acao: "inativar",
    entidade: "usuarios",
    entidade_id: id,
    resumo: `Inativou usuário ${existing.nome} (${existing.email})`,
  });

  return res.json({ ok: true });
});

usuariosRouter.post("/:id/reativar", (req, res) => {
  const id = req.params.id;
  const existing = db
    .prepare(`select id, email, nome from usuarios where id = ?`)
    .get(id) as { id: string; email: string; nome: string } | undefined;
  if (!existing) {
    return res.status(404).json({ error: "Usuário não encontrado" });
  }

  db.prepare(
    `update usuarios set ativo = 1, updated_at = datetime('now') where id = ?`,
  ).run(id);

  writeAuditLog({
    req,
    categoria: "sistema",
    acao: "reativar",
    entidade: "usuarios",
    entidade_id: id,
    resumo: `Reativou usuário ${existing.nome} (${existing.email})`,
  });

  return res.json({ ok: true });
});

/** Exclusão permanente — só usuários já inativos. */
usuariosRouter.delete("/:id", (req, res) => {
  const id = req.params.id;
  if (req.user?.id === id) {
    return res.status(400).json({ error: "Você não pode excluir o próprio usuário" });
  }

  const existing = db
    .prepare(
      `select id, email, nome, papel, ativo from usuarios where id = ?`,
    )
    .get(id) as
    | { id: string; email: string; nome: string; papel: string; ativo: number }
    | undefined;
  if (!existing) {
    return res.status(404).json({ error: "Usuário não encontrado" });
  }
  if (Number(existing.ativo ?? 1) !== 0) {
    return res.status(400).json({
      error: "Inative o usuário antes de excluir permanentemente",
    });
  }

  db.prepare("delete from usuarios where id = ?").run(id);

  writeAuditLog({
    req,
    categoria: "sistema",
    acao: "excluir",
    entidade: "usuarios",
    entidade_id: id,
    resumo: `Excluiu usuário ${existing.nome} (${existing.email})`,
    detalhes: { email: existing.email, papel: normalizePapel(existing.papel) },
  });

  return res.status(204).send();
});
