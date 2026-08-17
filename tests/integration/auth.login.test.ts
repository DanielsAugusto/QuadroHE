import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { getTestApp, resetTestData, TEST_ADMIN } from "../helpers/app.ts";
import { loginAdmin } from "../helpers/auth.ts";

describe("Integração: autenticação", () => {
  const app = getTestApp();

  beforeEach(() => {
    resetTestData();
  });

  it("GET /api/health responde sem autenticação", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("login com credenciais válidas devolve token e usuário sem senha", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: TEST_ADMIN.email,
      password: TEST_ADMIN.password,
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(TEST_ADMIN.email);
    expect(res.body.user.papel).toBe("admin");
    expect(res.body.user).not.toHaveProperty("senha_hash");
    expect(res.body).not.toHaveProperty("senha_hash");
  });

  it("login rejeita senha errada com a mesma mensagem de e-mail inexistente", async () => {
    const badPass = await request(app).post("/api/auth/login").send({
      email: TEST_ADMIN.email,
      password: "senha-errada-nao-e-essa",
    });
    const unknown = await request(app).post("/api/auth/login").send({
      email: "naoexiste@test.local",
      password: "qualquer-coisa",
    });
    expect(badPass.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(badPass.body.error).toBe(unknown.body.error);
    expect(badPass.body.error).toBe("Credenciais inválidas");
  });

  it("login exige e-mail e senha", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
  });

  it("GET /api/auth/me exige Bearer token", async () => {
    const noAuth = await request(app).get("/api/auth/me");
    expect(noAuth.status).toBe(401);

    const { auth, user } = await loginAdmin(app);
    const me = await request(app).get("/api/auth/me").set(auth);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(user.email);
  });

  it("API autenticada rejeita token malformado", async () => {
    const res = await request(app)
      .get("/api/professores")
      .set("Authorization", "Bearer nao-e-um-jwt");
    expect(res.status).toBe(401);
  });
});
