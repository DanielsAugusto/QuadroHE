import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { writeAuditLog } from "./audit.js";
import { db } from "./db.js";

export type PapelUsuario = "admin" | "operador";

export type AuthUser = {
  id: string;
  email: string;
  nome: string;
  papel: PapelUsuario;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}

export const SESSION_COOKIE = "quadrohe_session";
export const JWT_EXPIRES_IN = "2h";
const COOKIE_MAX_AGE_SEC = 2 * 60 * 60;

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET não configurado");
  }
  return secret;
}

/** Falha fechada: qualquer valor inválido vira operador (nunca admin). */
export function normalizePapel(raw: unknown): PapelUsuario {
  const p = String(raw ?? "")
    .trim()
    .toLowerCase();
  return p === "admin" ? "admin" : "operador";
}

export function assertAuthSecrets() {
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET não configurado");
  }
  if (isProd) {
    if (
      secret.length < 32 ||
      /troque|change.?me|secret.?padrao|exemplo|dev.?secret/i.test(secret)
    ) {
      throw new Error(
        "JWT_SECRET fraco ou de exemplo. Defina um segredo aleatório com pelo menos 32 caracteres.",
      );
    }
  } else if (secret.length < 16) {
    console.warn("JWT_SECRET curto — use um valor mais forte em produção.");
  }
}

export function adminMfaRequired(): boolean {
  const flag = String(process.env.QUADROHE_REQUIRE_ADMIN_MFA ?? "").trim();
  if (flag === "0" || flag.toLowerCase() === "false") return false;
  if (flag === "1" || flag.toLowerCase() === "true") return true;
  return process.env.NODE_ENV === "production";
}

export function signToken(user: AuthUser, tokenVersion: number): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      nome: user.nome,
      papel: user.papel,
      tv: tokenVersion,
    },
    jwtSecret(),
    { expiresIn: JWT_EXPIRES_IN, algorithm: "HS256" },
  );
}

export function signMfaPendingToken(
  userId: string,
  purpose: "mfa" | "mfa_setup",
): string {
  return jwt.sign({ sub: userId, purpose }, jwtSecret(), {
    expiresIn: "5m",
    algorithm: "HS256",
  });
}

export function verifyMfaPendingToken(
  token: string,
  purpose: "mfa" | "mfa_setup",
): string | null {
  try {
    const payload = jwt.verify(token, jwtSecret(), {
      algorithms: ["HS256"],
    }) as { sub?: string; purpose?: string };
    if (payload.purpose !== purpose) return null;
    const sub = String(payload.sub ?? "").trim();
    return sub || null;
  } catch {
    return null;
  }
}

function cookieValue(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export function tokenFromRequest(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const t = header.slice(7).trim();
    if (t) return t;
  }
  const fromCookie = cookieValue(req, SESSION_COOKIE);
  return fromCookie || null;
}

export function setSessionCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${COOKIE_MAX_AGE_SEC}`,
  ];
  if (isProd) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(res: Response) {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isProd) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

function loadUsuarioAtivo(
  id: string,
): (AuthUser & { tokenVersion: number }) | null {
  const row = db
    .prepare(
      `select id, email, nome, papel, ativo, ifnull(token_version, 1) as token_version
       from usuarios where id = ?`,
    )
    .get(id) as
    | {
        id: string;
        email: string;
        nome: string;
        papel: string;
        ativo: number | null;
        token_version: number;
      }
    | undefined;
  if (!row) return null;
  if (Number(row.ativo ?? 1) === 0) return null;
  return {
    id: row.id,
    email: row.email,
    nome: row.nome,
    papel: normalizePapel(row.papel),
    tokenVersion: Number(row.token_version) || 1,
  };
}

export function bumpTokenVersion(userId: string) {
  db.prepare(
    `update usuarios
     set token_version = ifnull(token_version, 1) + 1,
         updated_at = datetime('now')
     where id = ?`,
  ).run(userId);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = tokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: "Não autenticado" });
  }

  try {
    const payload = jwt.verify(token, jwtSecret(), {
      algorithms: ["HS256"],
    }) as {
      sub: string;
      email?: string;
      nome?: string;
      papel?: string;
      tv?: number;
      purpose?: string;
    };
    if (payload.purpose) {
      return res.status(401).json({ error: "Token inválido ou expirado" });
    }
    const fresh = loadUsuarioAtivo(payload.sub);
    if (!fresh) {
      return res.status(401).json({ error: "Usuário inativo ou não encontrado" });
    }
    const tokenTv = Number(payload.tv ?? 0);
    if (tokenTv !== fresh.tokenVersion) {
      return res.status(401).json({ error: "Token inválido ou expirado" });
    }
    req.user = {
      id: fresh.id,
      email: fresh.email,
      nome: fresh.nome,
      papel: fresh.papel,
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Não autenticado" });
  }
  if (req.user.papel !== "admin") {
    writeAuditLog({
      req,
      categoria: "sistema",
      acao: "authz_negada",
      entidade: "usuarios",
      entidade_id: req.user.id,
      resumo: `Acesso administrativo recusado para ${req.user.email}`,
      detalhes: {
        rota: req.originalUrl,
        metodo: req.method,
        papel: req.user.papel,
      },
    });
    return res.status(403).json({ error: "Apenas administradores podem fazer isso" });
  }
  return next();
}
