/**
 * Deve rodar antes de qualquer import do servidor.
 * Segredos de teste são gerados por processo — não ficam fixos no git.
 * dotenv não sobrescreve variáveis já definidas.
 */
import { randomBytes } from "node:crypto";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || randomBytes(32).toString("base64url");
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@test.local";
process.env.ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || `test-adm-${randomBytes(12).toString("base64url")}`;
process.env.TEST_OPERADOR_EMAIL =
  process.env.TEST_OPERADOR_EMAIL || "operador@test.local";
process.env.TEST_OPERADOR_PASSWORD =
  process.env.TEST_OPERADOR_PASSWORD ||
  `test-op-${randomBytes(12).toString("base64url")}`;
process.env.QUADROHE_DB_PATH = process.env.QUADROHE_DB_PATH || ":memory:";
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || "4";
