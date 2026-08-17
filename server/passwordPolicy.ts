const SENHAS_EXEMPLO = new Set([
  "admin123",
  "defina-uma-senha-forte",
  "password",
  "senha123",
  "12345678",
  "changeme",
  "troque-esta-senha",
]);

/** Senha fraca demais para o primeiro admin em produção. */
export function isWeakAdminPassword(password: string): boolean {
  const p = password.trim();
  if (p.length < 12) return true;
  return SENHAS_EXEMPLO.has(p.toLowerCase());
}

/** Custo do bcrypt. Em testes use BCRYPT_ROUNDS=4 para acelerar. */
export function bcryptRounds(): number {
  const n = Number(process.env.BCRYPT_ROUNDS || 12);
  if (!Number.isFinite(n) || n < 4 || n > 15) return 12;
  return Math.floor(n);
}
