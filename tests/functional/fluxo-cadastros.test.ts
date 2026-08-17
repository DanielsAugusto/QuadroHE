import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { getTestApp, resetTestData } from "../helpers/app.ts";
import { loginOperador } from "../helpers/auth.ts";

/**
 * Teste funcional: percorre um fluxo real de cadastro
 * (professor → escola → hora extra) como o operador faria na UI.
 */
describe("Funcional: fluxo de cadastros básicos", () => {
  const app = getTestApp();

  beforeEach(() => {
    resetTestData();
  });

  it("operador cadastra professor, escola e HE e consulta o conjunto", async () => {
    const { auth } = await loginOperador(app);

    const prof = await request(app).post("/api/professores").set(auth).send({
      matricula: "7001",
      nome: "Carla Mendes",
      cargo: "Professor II",
    });
    expect(prof.status).toBe(201);

    const escola = await request(app).post("/api/escolas").set(auth).send({
      nome: "EM Funcional",
    });
    expect(escola.status).toBe(201);

    const he = await request(app).post("/api/horas-extra").set(auth).send({
      matricula: "7001",
      nome: "Carla Mendes",
      tempos_autorizados: 8,
      tipo: "REAL",
      lotacao_origem: "EM Funcional",
    });
    expect(he.status).toBe(201);
    expect(he.body.matricula).toBe("7001");

    const ficha = await request(app).get("/api/professores/7001").set(auth);
    expect(ficha.status).toBe(200);
    expect(ficha.body.professor.nome).toBe("Carla Mendes");

    const escolas = await request(app).get("/api/escolas").set(auth);
    expect(escolas.status).toBe(200);
    const nomes = (escolas.body as Array<{ nome: string }>).map((e) => e.nome);
    expect(nomes).toContain("EM Funcional");
  });
});
