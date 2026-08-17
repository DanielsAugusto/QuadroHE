import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { getTestApp, resetTestData, TEST_ADMIN } from "../helpers/app.ts";

/**
 * BDD: os cenários abaixo espelham tests/bdd/features/autenticacao.feature
 */
describe("BDD: Autenticação na secretaria", () => {
  const app = getTestApp();

  beforeEach(() => {
    resetTestData();
  });

  describe("Cenário: Login bem-sucedido", () => {
    it("Dado admin cadastrado, Quando e-mail/senha corretos, Então recebe token sem senha", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: TEST_ADMIN.email,
        password: TEST_ADMIN.password,
      });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.user.email).toBe(TEST_ADMIN.email);
      expect(JSON.stringify(res.body)).not.toMatch(/senha_hash/);
    });
  });

  describe("Cenário: Senha incorreta", () => {
    it("Dado admin cadastrado, Quando senha errada, Então 401 Credenciais inválidas", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: TEST_ADMIN.email,
        password: "nao-e-essa-senha",
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Credenciais inválidas");
    });
  });

  describe("Cenário: Área restrita sem login", () => {
    it("Dado visitante, Quando lista professores, Então 401", async () => {
      const res = await request(app).get("/api/professores");
      expect(res.status).toBe(401);
    });
  });

  describe("Cenário: Logout encerra a sessão no servidor", () => {
    it("Dado admin autenticado, Quando sai, Então o token anterior deixa de valer", async () => {
      const login = await request(app).post("/api/auth/login").send({
        email: TEST_ADMIN.email,
        password: TEST_ADMIN.password,
      });
      const auth = { Authorization: `Bearer ${login.body.token}` };
      await request(app).post("/api/auth/logout").set(auth);
      const me = await request(app).get("/api/auth/me").set(auth);
      expect(me.status).toBe(401);
    });
  });
});
