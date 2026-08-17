import request from "supertest";
import type { Express } from "express";
import { TEST_ADMIN, TEST_OPERADOR } from "./app.ts";

export async function loginAs(
  app: Express,
  creds: { email: string; password: string } = TEST_ADMIN,
) {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: creds.email, password: creds.password });
  if (res.status !== 200 || !res.body?.token) {
    throw new Error(
      `Login falhou (${res.status}): ${JSON.stringify(res.body)}`,
    );
  }
  return {
    token: res.body.token as string,
    user: res.body.user as {
      id: string;
      email: string;
      nome: string;
      papel: string;
    },
    auth: { Authorization: `Bearer ${res.body.token}` },
  };
}

export function loginAdmin(app: Express) {
  return loginAs(app, TEST_ADMIN);
}

export function loginOperador(app: Express) {
  return loginAs(app, TEST_OPERADOR);
}
