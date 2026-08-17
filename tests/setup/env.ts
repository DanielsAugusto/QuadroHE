/**
 * Deve rodar antes de qualquer import do servidor.
 * dotenv não sobrescreve variáveis já definidas.
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-jwt-secret-quadrohe-32chars!!";
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@test.local";
process.env.ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "TestAdminPass12!";
process.env.QUADROHE_DB_PATH = process.env.QUADROHE_DB_PATH || ":memory:";
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || "4";
