import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { getTestApp, resetTestData } from "../helpers/app.ts";
import { loginAdmin, loginOperador } from "../helpers/auth.ts";

/**
 * Aceitação: só administrador gerencia contas.
 *
 * História: como administradora, quero criar e desativar operadores
 * para que quem saiu da equipe não continue acessando o QuadroHE.
 */
describe("Aceitação: gestão de usuários", () => {
  const app = getTestApp();

  beforeEach(() => {
    resetTestData();
  });

  it("dado que sou admin, quando crio um operador, então ele entra mas não gerencia usuários", async () => {
    const { auth } = await loginAdmin(app);
    const created = await request(app).post("/api/usuarios").set(auth).send({
      nome: "Operador Aceitação",
      email: "op.aceitacao@test.local",
      password: "SenhaForte9",
      papel: "operador",
    });
    expect(created.status).toBe(201);

    const sessao = await request(app).post("/api/auth/login").send({
      email: "op.aceitacao@test.local",
      password: "SenhaForte9",
    });
    expect(sessao.status).toBe(200);

    const bloqueado = await request(app)
      .get("/api/usuarios")
      .set("Authorization", `Bearer ${sessao.body.token}`);
    expect(bloqueado.status).toBe(403);
  });

  it("dado um operador, quando tenta se promover a admin no cadastro de usuários, então é recusado", async () => {
    const { auth, user } = await loginOperador(app);
    const res = await request(app)
      .put(`/api/usuarios/${user.id}`)
      .set(auth)
      .send({ nome: user.nome, email: user.email, papel: "admin" });
    expect(res.status).toBe(403);
  });
});
