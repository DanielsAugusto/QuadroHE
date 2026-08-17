import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { getTestApp, resetTestData } from "../helpers/app.ts";
import { loginOperador } from "../helpers/auth.ts";

/**
 * BDD: os cenários abaixo espelham tests/bdd/features/controle-acesso.feature
 */
describe("BDD: Controle de acesso por papel", () => {
  const app = getTestApp();

  beforeEach(() => {
    resetTestData();
  });

  describe("Cenário: Operador não lista usuários", () => {
    it("Dado operador autenticado, Quando GET /api/usuarios, Então 403", async () => {
      const { auth } = await loginOperador(app);
      const res = await request(app).get("/api/usuarios").set(auth);
      expect(res.status).toBe(403);
    });
  });

  describe("Cenário: Operador não se promove a admin", () => {
    it("Dado operador autenticado, Quando PUT papel=admin, Então 403", async () => {
      const { auth, user } = await loginOperador(app);
      const res = await request(app)
        .put(`/api/usuarios/${user.id}`)
        .set(auth)
        .send({ nome: user.nome, email: user.email, papel: "admin" });
      expect(res.status).toBe(403);
    });
  });
});
