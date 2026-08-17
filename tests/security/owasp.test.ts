import { Buffer } from "node:buffer";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../server/db.ts";
import { getTestApp, getUsuarioId, resetTestData, TEST_ADMIN } from "../helpers/app.ts";
import { loginAdmin, loginOperador } from "../helpers/auth.ts";

function jwtNone(payload: Record<string, unknown>) {
  const header = Buffer.from(
    JSON.stringify({ alg: "none", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.`;
}

describe("OWASP Top 10", () => {
  const app = getTestApp();

  beforeEach(() => {
    resetTestData();
  });

  describe("A01 Broken Access Control", () => {
    it("rotas de API exigem autenticação", async () => {
      const res = await request(app).get("/api/professores");
      expect(res.status).toBe(401);
    });

    it("operador não acessa endpoints de administração", async () => {
      const { auth } = await loginOperador(app);
      const usuarios = await request(app).get("/api/usuarios").set(auth);
      expect(usuarios.status).toBe(403);

      const importar = await request(app)
        .post("/api/escolas/import")
        .set(auth)
        .send({ itens: [{ nome: "X" }] });
      expect(importar.status).toBe(403);
    });
  });

  describe("A02 Cryptographic Failures", () => {
    it("senha é persistida como hash bcrypt, nunca em texto puro", async () => {
      const { auth } = await loginAdmin(app);
      await request(app).post("/api/usuarios").set(auth).send({
        nome: "Hash Check",
        email: "hash@test.local",
        password: "Senha visível 99",
        papel: "operador",
      });
      const row = db
        .prepare("select senha_hash from usuarios where email = ?")
        .get("hash@test.local") as { senha_hash: string };
      expect(row.senha_hash).not.toBe("Senha visível 99");
      expect(row.senha_hash.startsWith("$2")).toBe(true);
    });

    it("APIs de usuário não devolvem senha_hash", async () => {
      const { auth } = await loginAdmin(app);
      const list = await request(app).get("/api/usuarios").set(auth);
      expect(JSON.stringify(list.body)).not.toMatch(/senha_hash/);
    });
  });

  describe("A03 Injection", () => {
    it("e-mail de login com SQL não autentica nem apaga dados", async () => {
      const before = db
        .prepare("select count(*) as c from usuarios")
        .get() as { c: number };
      const res = await request(app).post("/api/auth/login").send({
        email: "' OR 1=1 --",
        password: "' OR 1=1 --",
      });
      expect(res.status).toBe(401);
      const after = db
        .prepare("select count(*) as c from usuarios")
        .get() as { c: number };
      expect(after.c).toBe(before.c);
    });
  });

  describe("A04 Insecure Design", () => {
    it("não permite remover o último administrador ativo", async () => {
      const { auth } = await loginAdmin(app);
      const id = getUsuarioId("admin@test.local");
      const res = await request(app)
        .put(`/api/usuarios/${id}`)
        .set(auth)
        .send({
          nome: "Admin",
          email: "admin@test.local",
          papel: "operador",
        });
      expect(res.status).toBe(400);
    });

    it("usuário não inativa a si mesmo", async () => {
      const { auth, user } = await loginAdmin(app);
      const res = await request(app)
        .post(`/api/usuarios/${user.id}/inativar`)
        .set(auth);
      expect(res.status).toBe(400);
    });
  });

  describe("A05 Security Misconfiguration", () => {
    it("Helmet envia cabeçalhos de proteção (CSP, nosniff, frame, referrer)", async () => {
      const res = await request(app).get("/api/health");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toMatch(/DENY|SAMEORIGIN/i);
      expect(res.headers["referrer-policy"]).toBe("no-referrer");
      expect(String(res.headers["content-security-policy"])).toMatch(
        /default-src 'self'/,
      );
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    it("health não vaza stack trace", async () => {
      const res = await request(app).get("/api/health");
      expect(res.body).toEqual({ ok: true });
      expect(res.body).not.toHaveProperty("stack");
    });

    it("erro de constraint do banco não vaza detalhe interno", async () => {
      const { auth } = await loginAdmin(app);
      const res = await request(app).post("/api/horas-extra").set(auth).send({
        matricula: "SEC1",
        nome: "Prof Constraint",
        tempos_autorizados: 2,
        tipo: "INVALIDO",
      });
      expect(res.status).toBe(400);
      const body = JSON.stringify(res.body).toUpperCase();
      expect(body).not.toMatch(/SQLITE|CONSTRAINT FAILED|CHECK CONSTRAINT/);
      expect(res.body.error).toBe("Tipo inválido");
    });
  });

  describe("A06 Vulnerable and Outdated Components", () => {
    it("xlsx de importação está na versão corrigida (>= 0.20.2)", async () => {
      const { readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const lock = JSON.parse(
        readFileSync(join(process.cwd(), "package-lock.json"), "utf8"),
      ) as {
        packages?: Record<string, { version?: string }>;
      };
      const version = lock.packages?.["node_modules/xlsx"]?.version ?? "";
      const parts = version.split(".").map(Number);
      expect(parts[0]).toBe(0);
      expect(parts[1]).toBeGreaterThanOrEqual(20);
      expect((parts[1] ?? 0) > 20 || (parts[2] ?? 0) >= 2).toBe(true);
    });
  });

  describe("A07 Identification and Authentication Failures", () => {
    it("rejeita JWT com alg none", async () => {
      const id = getUsuarioId("admin@test.local");
      const token = jwtNone({
        sub: id,
        email: "admin@test.local",
        papel: "admin",
        tv: 1,
      });
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(401);
    });

    it("rejeita JWT assinado com outro segredo", async () => {
      const id = getUsuarioId("admin@test.local");
      const token = jwt.sign(
        { sub: id, email: "admin@test.local", papel: "admin", tv: 1 },
        "segredo-falso-de-ataque-xxxxxxxx",
        { algorithm: "HS256", expiresIn: "8h" },
      );
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(401);
    });

    it("login com papel=admin no body não eleva privilégio", async () => {
      const { auth } = await loginAdmin(app);
      await request(app).post("/api/usuarios").set(auth).send({
        nome: "Operador Massa",
        email: "massa@test.local",
        password: "SenhaForte9",
        papel: "operador",
      });
      const login = await request(app).post("/api/auth/login").send({
        email: "massa@test.local",
        password: "SenhaForte9",
        papel: "admin",
      });
      expect(login.status).toBe(200);
      expect(login.body.user.papel).toBe("operador");
    });

    it("JWT de sessão dura 2 horas", async () => {
      const { token } = await loginAdmin(app);
      const payload = jwt.decode(token) as { iat: number; exp: number };
      expect(payload.exp - payload.iat).toBe(2 * 60 * 60);
    });

    it("login define cookie HttpOnly SameSite", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: TEST_ADMIN.email,
        password: TEST_ADMIN.password,
      });
      const cookie = String(res.headers["set-cookie"] ?? "");
      expect(cookie).toMatch(/quadrohe_session=/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
    });

    it("logout no servidor invalida o token anterior", async () => {
      const { auth } = await loginAdmin(app);
      const out = await request(app).post("/api/auth/logout").set(auth);
      expect(out.status).toBe(200);
      const me = await request(app).get("/api/auth/me").set(auth);
      expect(me.status).toBe(401);
    });

    it("admin com MFA não recebe sessão só com a senha", async () => {
      const { generateTotpSecret, totpCode } = await import(
        "../../server/totp.ts"
      );
      const secret = generateTotpSecret();
      db.prepare(
        `update usuarios set mfa_secret = ?, mfa_enabled = 1 where email = ?`,
      ).run(secret, "admin@test.local");

      const step1 = await request(app).post("/api/auth/login").send({
        email: TEST_ADMIN.email,
        password: TEST_ADMIN.password,
      });
      expect(step1.status).toBe(200);
      expect(step1.body.mfa_required).toBe(true);
      expect(step1.body.token).toBeUndefined();

      const pending = await request(app)
        .get("/api/usuarios")
        .set("Authorization", `Bearer ${step1.body.mfa_token}`);
      expect(pending.status).toBe(401);

      const step2 = await request(app).post("/api/auth/login/mfa").send({
        mfa_token: step1.body.mfa_token,
        code: totpCode(secret),
      });
      expect(step2.status).toBe(200);
      expect(step2.body.token).toEqual(expect.any(String));
      expect(step2.body.user.papel).toBe("admin");
    });

    it("bloqueia a conta após falhas repetidas de senha", async () => {
      for (let i = 0; i < 5; i++) {
        await request(app).post("/api/auth/login").send({
          email: "admin@test.local",
          password: "senha-errada-nao-e-essa",
        });
      }
      const locked = await request(app).post("/api/auth/login").send({
        email: TEST_ADMIN.email,
        password: TEST_ADMIN.password,
      });
      expect(locked.status).toBe(429);
    });

    it("usuário inativo não autentica", async () => {
      const { auth } = await loginAdmin(app);
      const created = await request(app).post("/api/usuarios").set(auth).send({
        nome: "Inativo",
        email: "inativo@test.local",
        password: "SenhaForte9",
        papel: "operador",
      });
      await request(app)
        .post(`/api/usuarios/${created.body.id}/inativar`)
        .set(auth);
      const login = await request(app).post("/api/auth/login").send({
        email: "inativo@test.local",
        password: "SenhaForte9",
      });
      expect(login.status).toBe(401);
      expect(login.body.error).toBe("Credenciais inválidas");
    });
  });

  describe("A08 Software and Data Integrity Failures", () => {
    it("token com papel admin forjado no payload não concede admin se o banco diz operador", async () => {
      const { user } = await loginOperador(app);
      const token = jwt.sign(
        {
          sub: user.id,
          email: user.email,
          nome: user.nome,
          papel: "admin",
          tv: 1,
        },
        process.env.JWT_SECRET as string,
        { algorithm: "HS256", expiresIn: "8h" },
      );
      const res = await request(app)
        .get("/api/usuarios")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    });
  });

  describe("A09 Security Logging and Monitoring Failures", () => {
    it("criação de usuário gera registro de auditoria", async () => {
      const { auth } = await loginAdmin(app);
      await request(app).post("/api/usuarios").set(auth).send({
        nome: "Auditado",
        email: "audit@test.local",
        password: "SenhaForte9",
        papel: "operador",
      });
      const log = db
        .prepare(
          `select acao, entidade, resumo from audit_logs
           where entidade = 'usuarios' and acao = 'criar'
           order by created_at desc`,
        )
        .get() as { acao: string; entidade: string; resumo: string } | undefined;
      expect(log).toBeTruthy();
      expect(log?.resumo).toMatch(/Auditado/);
    });

    it("login recusado gera log sem senha", async () => {
      await request(app).post("/api/auth/login").send({
        email: "admin@test.local",
        password: "senha-errada-nao-e-essa",
      });
      const log = db
        .prepare(
          `select acao, resumo, detalhes from audit_logs
           where acao = 'login_falha'
           order by created_at desc`,
        )
        .get() as
        | { acao: string; resumo: string; detalhes: string | null }
        | undefined;
      expect(log?.acao).toBe("login_falha");
      expect(JSON.stringify(log)).not.toMatch(/senha-errada|senha_hash/i);
      expect(JSON.stringify(log)).not.toContain(TEST_ADMIN.password);
    });

    it("login bem-sucedido gera log de acesso", async () => {
      await loginAdmin(app);
      const log = db
        .prepare(
          `select acao, resumo from audit_logs
           where acao = 'login'
           order by created_at desc`,
        )
        .get() as { acao: string; resumo: string } | undefined;
      expect(log?.acao).toBe("login");
      expect(log?.resumo).toMatch(/admin@test.local/);
    });

    it("operador recusado em rota admin gera log de autorização", async () => {
      const { auth } = await loginOperador(app);
      await request(app).get("/api/usuarios").set(auth);
      const log = db
        .prepare(
          `select acao, resumo, detalhes from audit_logs
           where acao = 'authz_negada'
           order by created_at desc`,
        )
        .get() as
        | { acao: string; resumo: string; detalhes: string | null }
        | undefined;
      expect(log?.acao).toBe("authz_negada");
      expect(JSON.stringify(log)).not.toMatch(/Authorization|senha_hash/i);
    });

    it("falhas repetidas de login geram alerta sem senha", async () => {
      for (let i = 0; i < 5; i++) {
        await request(app).post("/api/auth/login").send({
          email: "admin@test.local",
          password: "senha-errada-nao-e-essa",
        });
      }
      const log = db
        .prepare(
          `select acao, detalhes from audit_logs
           where acao = 'alerta'
           order by created_at desc`,
        )
        .get() as { acao: string; detalhes: string | null } | undefined;
      expect(log?.acao).toBe("alerta");
      expect(JSON.stringify(log)).not.toMatch(/senha-errada/i);
      expect(JSON.stringify(log)).not.toContain(TEST_ADMIN.password);
    });

    it("resposta inclui X-Request-Id", async () => {
      const res = await request(app).get("/api/health");
      expect(String(res.headers["x-request-id"]).length).toBeGreaterThanOrEqual(8);
    });
  });

  describe("A01 SSRF (A10:2021)", () => {
    it("API não busca URL enviada pelo cliente em campos de cadastro", async () => {
      const { auth } = await loginAdmin(app);
      const res = await request(app).post("/api/professores").set(auth).send({
        matricula: "SSRF1",
        nome: "http://127.0.0.1/secret",
      });
      expect(res.status).toBe(201);
      expect(res.body.nome).toBe("http://127.0.0.1/secret");
    });
  });

  describe("A10 Mishandling of Exceptional Conditions", () => {
    it("JWT inválido falha fechado sem vazar detalhe interno", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer isto-nao-e-jwt");
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body).toLowerCase()).not.toMatch(
        /stack|jsonwebtoken|unexpected/,
      );
    });
  });
});
