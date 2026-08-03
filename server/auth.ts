import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type AuthUser = {
  id: string;
  email: string;
  nome: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET não configurado");
  }
  return secret;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, email: user.email, nome: user.nome },
    jwtSecret(),
    { expiresIn: "8h" },
  );
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Não autenticado" });
  }

  try {
    const payload = jwt.verify(header.slice(7), jwtSecret()) as {
      sub: string;
      email: string;
      nome: string;
    };
    req.user = {
      id: payload.sub,
      email: payload.email,
      nome: payload.nome,
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}
