import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getTestApp,
  resetTestData,
  TEST_OPERADOR,
} from "../helpers/app.ts";
import { loginAdmin, loginOperador } from "../helpers/auth.ts";

describe("Integração: usuários", () => {
  const app = getTestApp();

  beforeEach(() => {
    resetTestData();
  });

  it("admin lista usuários sem expor hash de senha", async () => {
    const { auth } = await loginAdmin(app);
    const res = await request(app).get("/api/usuarios").set(auth);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    for (const u of res.body) {
      expect(u).not.toHaveProperty("senha_hash");
      expect(u.email).toEqual(expect.any(String));
    }
  });

  it("admin cria operador e o novo usuário consegue logar", async () => {
    const { auth } = await loginAdmin(app);
    const created = await request(app).post("/api/usuarios").set(auth).send({
      nome: "Novo Operador",
      email: "novo.op@test.local",
      password: "SenhaForte9",
      papel: "operador",
    });
    expect(created.status).toBe(201);
    expect(created.body.papel).toBe("operador");
    expect(created.body).not.toHaveProperty("senha_hash");

    const login = await request(app).post("/api/auth/login").send({
      email: "novo.op@test.local",
      password: "SenhaForte9",
    });
    expect(login.status).toBe(200);
  });

  it("não cria usuário com senha curta ou e-mail inválido", async () => {
    const { auth } = await loginAdmin(app);
    const curta = await request(app).post("/api/usuarios").set(auth).send({
      nome: "X",
      email: "x@test.local",
      password: "123",
    });
    expect(curta.status).toBe(400);

    const email = await request(app).post("/api/usuarios").set(auth).send({
      nome: "X",
      email: "sem-arroba",
      password: "SenhaForte9",
    });
    expect(email.status).toBe(400);
  });

  it("não permite rebaixar o último admin nem inativar a si mesmo", async () => {
    const { auth, user } = await loginAdmin(app);
    const self = await request(app)
      .post(`/api/usuarios/${user.id}/inativar`)
      .set(auth);
    expect(self.status).toBe(400);
    expect(self.body.error).toMatch(/próprio usuário/i);

    const demote = await request(app)
      .put(`/api/usuarios/${user.id}`)
      .set(auth)
      .send({
        nome: user.nome,
        email: user.email,
        papel: "operador",
      });
    expect(demote.status).toBe(400);
    expect(demote.body.error).toMatch(/último administrador/i);
  });

  it("inativar usuário invalida o token antigo", async () => {
    const { auth } = await loginAdmin(app);
    const created = await request(app).post("/api/usuarios").set(auth).send({
      nome: "Temporário",
      email: "temp@test.local",
      password: "SenhaForte9",
      papel: "operador",
    });
    const id = created.body.id as string;

    const sessao = await request(app).post("/api/auth/login").send({
      email: "temp@test.local",
      password: "SenhaForte9",
    });
    const tempAuth = { Authorization: `Bearer ${sessao.body.token}` };

    const meOk = await request(app).get("/api/auth/me").set(tempAuth);
    expect(meOk.status).toBe(200);

    const inat = await request(app)
      .post(`/api/usuarios/${id}/inativar`)
      .set(auth);
    expect(inat.status).toBe(200);

    const meFail = await request(app).get("/api/auth/me").set(tempAuth);
    expect(meFail.status).toBe(401);
  });

  it("operador não acessa gestão de usuários", async () => {
    const { auth } = await loginOperador(app);
    const res = await request(app).get("/api/usuarios").set(auth);
    expect(res.status).toBe(403);
    expect(TEST_OPERADOR.email).toBeTruthy();
  });
});
