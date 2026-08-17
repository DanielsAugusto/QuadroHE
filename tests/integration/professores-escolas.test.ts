import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { getTestApp, resetTestData } from "../helpers/app.ts";
import { loginAdmin, loginOperador } from "../helpers/auth.ts";

describe("Integração: professores e escolas", () => {
  const app = getTestApp();

  beforeEach(() => {
    resetTestData();
  });

  it("operador cadastra professor e consulta por matrícula", async () => {
    const { auth } = await loginOperador(app);
    const created = await request(app).post("/api/professores").set(auth).send({
      matricula: "12345",
      nome: "Maria Silva",
      cargo: "Professor",
      funcao: "Regente",
    });
    expect(created.status).toBe(201);
    expect(created.body.matricula).toBe("12345");

    const get = await request(app)
      .get("/api/professores/12345")
      .set(auth);
    expect(get.status).toBe(200);
    expect(get.body.professor.nome).toBe("Maria Silva");
  });

  it("não duplica matrícula", async () => {
    const { auth } = await loginAdmin(app);
    await request(app).post("/api/professores").set(auth).send({
      matricula: "999",
      nome: "A",
    });
    const dup = await request(app).post("/api/professores").set(auth).send({
      matricula: "999",
      nome: "B",
    });
    expect(dup.status).toBe(409);
  });

  it("busca paginada filtra por nome", async () => {
    const { auth } = await loginAdmin(app);
    await request(app).post("/api/professores").set(auth).send({
      matricula: "1",
      nome: "Ana Costa",
    });
    await request(app).post("/api/professores").set(auth).send({
      matricula: "2",
      nome: "Bruno Lima",
    });

    const res = await request(app)
      .get("/api/professores")
      .query({ page: 1, pageSize: 20, q: "ana" })
      .set(auth);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].nome).toBe("Ana Costa");
  });

  it("cadastra escola e impede nome duplicado", async () => {
    const { auth } = await loginAdmin(app);
    const a = await request(app).post("/api/escolas").set(auth).send({
      nome: "EM Teste",
      em_carencias: true,
    });
    expect(a.status).toBe(201);
    expect(a.body.em_carencias).toBe(1);

    const dup = await request(app).post("/api/escolas").set(auth).send({
      nome: "EM Teste",
    });
    expect(dup.status).toBe(409);
  });
});
