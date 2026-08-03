import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import { db } from "../db.js";
import { requireAuth, signToken } from "../auth.js";

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

authRouter.post("/login", loginLimiter, async (req, res) => {
  const email = String(req.body?.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(req.body?.password ?? "");

  if (!email || !password) {
    return res.status(400).json({ error: "Informe e-mail e senha" });
  }

  const user = db
    .prepare("select id, email, nome, senha_hash from usuarios where email = ?")
    .get(email) as
    | { id: string; email: string; nome: string; senha_hash: string }
    | undefined;

  if (!user) {
    return res.status(401).json({ error: "Credenciais inválidas" });
  }

  const ok = await bcrypt.compare(password, user.senha_hash);
  if (!ok) {
    return res.status(401).json({ error: "Credenciais inválidas" });
  }

  const token = signToken({
    id: user.id,
    email: user.email,
    nome: user.nome,
  });

  return res.json({
    token,
    user: { id: user.id, email: user.email, nome: user.nome },
  });
});

authRouter.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});
