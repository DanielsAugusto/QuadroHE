import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { getTestApp, resetTestData, TEST_ADMIN } from "../helpers/app.ts";
import { loginAdmin } from "../helpers/auth.ts";

/**
 * Aceitação: critérios de negócio em linguagem de usuário.
 *
 * História: como servidor(a) da secretaria, quero entrar no sistema
 * com meu e-mail institucional para acessar os cadastros.
 */
describe("Aceitação: autenticação na secretaria", () => {
  const app = getTestApp();

  beforeEach(() => {
    resetTestData();
  });

  it("dado um administrador cadastrado, quando informa e-mail e senha corretos, então entra e vê o próprio perfil", async () => {
    const login = await request(app).post("/api/auth/login").send({
      email: TEST_ADMIN.email,
      password: TEST_ADMIN.password,
    });
    expect(login.status).toBe(200);
    expect(login.body.user.papel).toBe("admin");

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(TEST_ADMIN.email);
  });

  it("dado um visitante sem conta, quando tenta listar professores, então o sistema recusa o acesso", async () => {
    const res = await request(app).get("/api/professores");
    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  it("dado um administrador logado, quando a senha é trocada, então a sessão anterior deixa de valer", async () => {
    const { auth, user } = await loginAdmin(app);
    const troca = await request(app)
      .put(`/api/usuarios/${user.id}`)
      .set(auth)
      .send({
        nome: user.nome,
        email: user.email,
        papel: "admin",
        password: "NovaSenhaForte1",
      });
    expect(troca.status).toBe(200);

    const sessaoAntiga = await request(app).get("/api/auth/me").set(auth);
    expect(sessaoAntiga.status).toBe(401);

    const novoLogin = await request(app).post("/api/auth/login").send({
      email: TEST_ADMIN.email,
      password: "NovaSenhaForte1",
    });
    expect(novoLogin.status).toBe(200);
  });
});
