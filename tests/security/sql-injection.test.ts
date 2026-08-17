import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../server/db.ts";
import { countTable, getTestApp, resetTestData } from "../helpers/app.ts";
import { loginAdmin } from "../helpers/auth.ts";

const PAYLOADS = [
  "' OR '1'='1",
  "' OR 1=1 --",
  "'; DROP TABLE professores; --",
  "' UNION SELECT email, senha_hash FROM usuarios --",
  "1; SELECT * FROM sqlite_master --",
  "admin'--",
  "'; DELETE FROM usuarios; --",
  "%'; DROP TABLE escolas; --",
];

describe("Segurança: SQL injection", () => {
  const app = getTestApp();

  beforeEach(() => {
    resetTestData();
  });

  it("login trata payload como credencial, não como SQL", async () => {
    const usuariosAntes = countTable("usuarios");
    for (const payload of PAYLOADS) {
      const res = await request(app).post("/api/auth/login").send({
        email: payload,
        password: payload,
      });
      expect(res.status, payload).toBeGreaterThanOrEqual(400);
      expect(res.status, payload).toBeLessThan(500);
      expect(res.body.token).toBeUndefined();
    }
    expect(countTable("usuarios")).toBe(usuariosAntes);
  });

  it("busca de professores não executa SQL injetado no parâmetro q", async () => {
    const { auth } = await loginAdmin(app);
    await request(app).post("/api/professores").set(auth).send({
      matricula: "100",
      nome: "Alvo Injection",
    });

    for (const payload of PAYLOADS) {
      const res = await request(app)
        .get("/api/professores")
        .query({ page: 1, q: payload })
        .set(auth);
      expect(res.status, payload).toBe(200);
    }

    expect(countTable("professores")).toBe(1);
    const still = db
      .prepare("select nome from professores where matricula = ?")
      .get("100") as { nome: string };
    expect(still.nome).toBe("Alvo Injection");
  });

  it("matrícula na URL não altera a consulta (parameter binding)", async () => {
    const { auth } = await loginAdmin(app);
    await request(app).post("/api/professores").set(auth).send({
      matricula: "200",
      nome: "Seguro",
    });

    const res = await request(app)
      .get("/api/professores/' OR '1'='1")
      .set(auth);
    expect(res.status).toBe(404);
    expect(countTable("professores")).toBe(1);
  });

  it("nome de escola malicioso é gravado como texto, não como SQL", async () => {
    const { auth } = await loginAdmin(app);
    const nome = "EM '); DROP TABLE disciplinas; --";
    const created = await request(app).post("/api/escolas").set(auth).send({
      nome,
    });
    expect(created.status).toBe(201);
    expect(created.body.nome).toBe(nome);
    expect(countTable("disciplinas")).toBeGreaterThan(0);
  });

  it("filtro de lotação com payload não derruba tabelas", async () => {
    const { auth } = await loginAdmin(app);
    for (const payload of PAYLOADS) {
      const res = await request(app)
        .get("/api/lotacao/escolas")
        .query({ q: payload })
        .set(auth);
      expect(res.status, payload).toBe(200);
    }
    expect(countTable("usuarios")).toBeGreaterThanOrEqual(2);
  });
});
