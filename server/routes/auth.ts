import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import { writeAuditLog } from "../audit.js";
import { db } from "../db.js";
import {
  adminMfaRequired,
  bumpTokenVersion,
  clearSessionCookie,
  normalizePapel,
  requireAuth,
  setSessionCookie,
  signMfaPendingToken,
  signToken,
  verifyMfaPendingToken,
  type AuthUser,
} from "../auth.js";
import {
  clearLoginFailures,
  isLoginLocked,
  registerLoginFailure,
} from "../loginLockout.js";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  otpauthUrl,
  verifyTotp,
} from "../totp.js";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Muitas tentativas de login. Tente novamente em alguns minutos.",
  },
});

const loginGuards = process.env.NODE_ENV === "test" ? [] : [loginLimiter];

const LOCK_MSG =
  "Muitas tentativas de login. Tente novamente em alguns minutos.";

type UsuarioLogin = {
  id: string;
  email: string;
  nome: string;
  senha_hash: string;
  papel: string;
  ativo: number | null;
  token_version: number;
  mfa_secret: string | null;
  mfa_enabled: number | null;
};

function loadByEmail(email: string): UsuarioLogin | undefined {
  return db
    .prepare(
      `select id, email, nome, senha_hash, papel, ativo,
              ifnull(token_version, 1) as token_version,
              mfa_secret, ifnull(mfa_enabled, 0) as mfa_enabled
       from usuarios where email = ?`,
    )
    .get(email) as UsuarioLogin | undefined;
}

function loadById(id: string): UsuarioLogin | undefined {
  return db
    .prepare(
      `select id, email, nome, senha_hash, papel, ativo,
              ifnull(token_version, 1) as token_version,
              mfa_secret, ifnull(mfa_enabled, 0) as mfa_enabled
       from usuarios where id = ?`,
    )
    .get(id) as UsuarioLogin | undefined;
}

function toAuthUser(user: UsuarioLogin): AuthUser {
  return {
    id: user.id,
    email: user.email,
    nome: user.nome,
    papel: normalizePapel(user.papel),
  };
}

function issueSession(req: { user?: AuthUser }, res: import("express").Response, user: UsuarioLogin) {
  const authUser = toAuthUser(user);
  const token = signToken(authUser, Number(user.token_version) || 1);
  req.user = authUser;
  setSessionCookie(res, token);
  writeAuditLog({
    req: req as import("express").Request,
    categoria: "sistema",
    acao: "login",
    entidade: "usuarios",
    entidade_id: user.id,
    resumo: `Login de ${user.nome} (${user.email})`,
    detalhes: { email: user.email },
  });
  return res.json({ token, user: authUser });
}

function noteLoginFailure(
  req: import("express").Request,
  email: string,
  entidadeId?: string,
) {
  const { locked, alert } = registerLoginFailure(email);
  writeAuditLog({
    req,
    categoria: "sistema",
    acao: "login_falha",
    entidade: "usuarios",
    entidade_id: entidadeId ?? null,
    resumo: "Tentativa de login recusada",
    detalhes: { email },
  });
  if (alert) {
    writeAuditLog({
      req,
      categoria: "sistema",
      acao: "alerta",
      entidade: "usuarios",
      entidade_id: entidadeId ?? null,
      resumo: `Bloqueio temporário após falhas repetidas de login`,
      detalhes: { email },
    });
  }
  return locked;
}

authRouter.post("/login", ...loginGuards, async (req, res) => {
  const email = String(req.body?.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(req.body?.password ?? "");

  if (!email || !password) {
    return res.status(400).json({ error: "Informe e-mail e senha" });
  }

  if (isLoginLocked(email)) {
    writeAuditLog({
      req,
      categoria: "sistema",
      acao: "login_falha",
      entidade: "usuarios",
      resumo: "Tentativa de login recusada",
      detalhes: { email, motivo: "bloqueio" },
    });
    return res.status(429).json({ error: LOCK_MSG });
  }

  const user = loadByEmail(email);

  if (!user || Number(user.ativo ?? 1) === 0) {
    const locked = noteLoginFailure(req, email, user?.id);
    if (locked) return res.status(429).json({ error: LOCK_MSG });
    return res.status(401).json({ error: "Credenciais inválidas" });
  }

  const ok = await bcrypt.compare(password, user.senha_hash);
  if (!ok) {
    const locked = noteLoginFailure(req, email, user.id);
    if (locked) return res.status(429).json({ error: LOCK_MSG });
    return res.status(401).json({ error: "Credenciais inválidas" });
  }

  clearLoginFailures(email);

  const storedSecret = decryptTotpSecret(String(user.mfa_secret ?? ""));
  const mfaOn = Number(user.mfa_enabled ?? 0) === 1 && Boolean(storedSecret);
  const papel = normalizePapel(user.papel);
  const mustSetup =
    papel === "admin" && adminMfaRequired() && !mfaOn;

  if (mfaOn) {
    return res.json({
      mfa_required: true,
      mfa_token: signMfaPendingToken(user.id, "mfa"),
    });
  }

  if (mustSetup) {
    const secret = storedSecret || generateTotpSecret();
    if (!storedSecret) {
      db.prepare(
        `update usuarios set mfa_secret = ?, updated_at = datetime('now') where id = ?`,
      ).run(encryptTotpSecret(secret), user.id);
    }
    return res.json({
      mfa_setup_required: true,
      mfa_token: signMfaPendingToken(user.id, "mfa_setup"),
      otpauth_url: otpauthUrl(user.email, secret),
      secret,
    });
  }

  return issueSession(req, res, user);
});

authRouter.post("/login/mfa", ...loginGuards, (req, res) => {
  const mfaToken = String(req.body?.mfa_token ?? "").trim();
  const code = String(req.body?.code ?? "").trim();
  if (!mfaToken || !code) {
    return res.status(400).json({ error: "Informe o código de verificação" });
  }

  const setupId = verifyMfaPendingToken(mfaToken, "mfa_setup");
  const loginId = verifyMfaPendingToken(mfaToken, "mfa");
  const userId = setupId || loginId;
  if (!userId) {
    return res.status(401).json({ error: "Código inválido ou expirado" });
  }

  const user = loadById(userId);
  if (!user || Number(user.ativo ?? 1) === 0) {
    return res.status(401).json({ error: "Código inválido ou expirado" });
  }

  if (isLoginLocked(user.email)) {
    return res.status(429).json({ error: LOCK_MSG });
  }

  const secret = decryptTotpSecret(String(user.mfa_secret ?? ""));
  if (!secret || !verifyTotp(secret, code)) {
    const locked = noteLoginFailure(req, user.email, user.id);
    if (locked) return res.status(429).json({ error: LOCK_MSG });
    return res.status(401).json({ error: "Código inválido ou expirado" });
  }

  clearLoginFailures(user.email);

  if (setupId) {
    db.prepare(
      `update usuarios set mfa_enabled = 1, updated_at = datetime('now') where id = ?`,
    ).run(user.id);
    writeAuditLog({
      req,
      categoria: "sistema",
      acao: "mfa",
      entidade: "usuarios",
      entidade_id: user.id,
      resumo: `Ativou verificação em duas etapas (${user.email})`,
    });
    const fresh = loadById(user.id);
    if (!fresh) {
      return res.status(401).json({ error: "Código inválido ou expirado" });
    }
    return issueSession(req, res, fresh);
  }

  return issueSession(req, res, user);
});

authRouter.post("/logout", requireAuth, (req, res) => {
  const user = req.user;
  if (user) {
    bumpTokenVersion(user.id);
    writeAuditLog({
      req,
      categoria: "sistema",
      acao: "logout",
      entidade: "usuarios",
      entidade_id: user.id,
      resumo: `Logout de ${user.nome} (${user.email})`,
      detalhes: { email: user.email },
    });
  }
  clearSessionCookie(res);
  return res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

authRouter.get("/mfa/setup", requireAuth, (req, res) => {
  const user = req.user!;
  const row = db
    .prepare(
      `select ifnull(mfa_enabled, 0) as mfa_enabled from usuarios where id = ?`,
    )
    .get(user.id) as { mfa_enabled: number } | undefined;
  if (Number(row?.mfa_enabled) === 1) {
    return res.status(400).json({
      error: "Verificação em duas etapas já está ativa",
    });
  }
  const secret = generateTotpSecret();
  db.prepare(
    `update usuarios set mfa_secret = ?, updated_at = datetime('now') where id = ?`,
  ).run(encryptTotpSecret(secret), user.id);
  return res.json({
    secret,
    otpauth_url: otpauthUrl(user.email, secret),
  });
});

authRouter.post("/mfa/enable", requireAuth, (req, res) => {
  const user = req.user!;
  const code = String(req.body?.code ?? "").trim();
  const row = db
    .prepare(`select mfa_secret from usuarios where id = ?`)
    .get(user.id) as { mfa_secret: string | null } | undefined;
  const secret = decryptTotpSecret(String(row?.mfa_secret ?? ""));
  if (!secret || !verifyTotp(secret, code)) {
    return res.status(400).json({ error: "Código inválido" });
  }
  db.prepare(
    `update usuarios set mfa_enabled = 1, updated_at = datetime('now') where id = ?`,
  ).run(user.id);
  writeAuditLog({
    req,
    categoria: "sistema",
    acao: "mfa",
    entidade: "usuarios",
    entidade_id: user.id,
    resumo: `Ativou verificação em duas etapas (${user.email})`,
  });
  return res.json({ ok: true, mfa_enabled: true });
});

authRouter.post("/mfa/disable", requireAuth, async (req, res) => {
  const user = req.user!;
  if (user.papel === "admin" && adminMfaRequired()) {
    return res.status(400).json({
      error: "Administradores devem manter a verificação em duas etapas",
    });
  }
  const password = String(req.body?.password ?? "");
  const code = String(req.body?.code ?? "").trim();
  const row = db
    .prepare(`select senha_hash, mfa_secret, mfa_enabled from usuarios where id = ?`)
    .get(user.id) as
    | { senha_hash: string; mfa_secret: string | null; mfa_enabled: number }
    | undefined;
  if (!row) return res.status(401).json({ error: "Não autenticado" });
  const passOk = await bcrypt.compare(password, row.senha_hash);
  const totpOk =
    Number(row.mfa_enabled) !== 1 ||
    verifyTotp(decryptTotpSecret(String(row.mfa_secret ?? "")), code);
  if (!passOk || !totpOk) {
    return res.status(401).json({ error: "Credenciais inválidas" });
  }
  db.prepare(
    `update usuarios
     set mfa_enabled = 0, mfa_secret = null, updated_at = datetime('now')
     where id = ?`,
  ).run(user.id);
  writeAuditLog({
    req,
    categoria: "sistema",
    acao: "mfa",
    entidade: "usuarios",
    entidade_id: user.id,
    resumo: `Desativou verificação em duas etapas (${user.email})`,
  });
  return res.json({ ok: true, mfa_enabled: false });
});
