import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../server/db.ts";
import {
  inativarHorasExtraExpiradas,
  resetHeExpiryThrottle,
} from "../../server/heExpiry.ts";
import { getTestApp, resetTestData } from "../helpers/app.ts";
import { loginAdmin } from "../helpers/auth.ts";

describe("Funcional: hora extra expirada", () => {
  const app = getTestApp();

  beforeEach(() => {
    resetTestData();
    resetHeExpiryThrottle();
  });

  it("inativa automaticamente HE cujo término já passou", async () => {
    const { auth } = await loginAdmin(app);
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const termino = ontem.toISOString().slice(0, 10);

    const created = await request(app).post("/api/horas-extra").set(auth).send({
      matricula: "HE1",
      nome: "Prof HE",
      tempos_autorizados: 10,
      tipo: "REAL",
      inicio: "2020-01-01",
      termino,
    });
    expect(created.status).toBe(201);
    expect(created.body.ativo).toBe(1);

    const n = inativarHorasExtraExpiradas(undefined, true);
    expect(n).toBe(1);

    const row = db
      .prepare("select ativo from horas_extra where id = ?")
      .get(created.body.id) as { ativo: number };
    expect(row.ativo).toBe(0);
  });

  it("não inativa HE ainda vigente (término hoje ou futuro)", async () => {
    const { auth } = await loginAdmin(app);
    const hoje = new Date().toISOString().slice(0, 10);
    const created = await request(app).post("/api/horas-extra").set(auth).send({
      matricula: "HE2",
      nome: "Prof Vigente",
      tempos_autorizados: 4,
      termino: hoje,
    });
    expect(created.status).toBe(201);

    const n = inativarHorasExtraExpiradas(undefined, true);
    expect(n).toBe(0);

    const row = db
      .prepare("select ativo from horas_extra where id = ?")
      .get(created.body.id) as { ativo: number };
    expect(row.ativo).toBe(1);
  });

  it("GET /api/horas-extra dispara a inativação e omite HE expirada da lista padrão", async () => {
    const { auth } = await loginAdmin(app);
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    await request(app).post("/api/horas-extra").set(auth).send({
      matricula: "HE3",
      nome: "Prof Lista",
      tempos_autorizados: 2,
      termino: ontem.toISOString().slice(0, 10),
    });

    resetHeExpiryThrottle();
    const list = await request(app).get("/api/horas-extra").set(auth);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
  });
});
