---
name: application-security-guard
description: >-
  Preventive application-security layer for SQL injection, vulnerable
  dependencies, and exposed secrets/credentials. Use always when creating or
  changing database access, user-input endpoints, dependencies, Dockerfile/CI/CD,
  env files, when reviewing PRs, preparing deploy, or when the user mentions
  SQL injection, npm audit, secrets, credenciais, .env, or AppSec.
---

# Application Security Guard

Camada preventiva. Identifique riscos, corrija na stack do **QuadroHE** e **impeça que código inseguro seja aprovado**. Três pilares: **SQL Injection**, **stack/dependências vulneráveis**, **segredos expostos**.

Risco relevante → **bloquear aprovação** até correção ou justificativa técnica documentada. Não só apontar: orientar com exemplo na stack deste repo.

Complementa o skill `owasp-top-10` (A01–A10). Este skill foca SQLi, deps e secrets.

Padrões SQLite deste repo: [stack.md](stack.md).

## Quando acionar

Criar/alterar acesso a banco · endpoints, filtros, buscas, ordenação, paginação, imports com entrada do usuário · dependências · Dockerfile, CI/CD, runtime · `.env`/config/deploy · revisão de PR · preparação de deploy.

## Stack deste projeto (referência real)

- **Backend**: TypeScript ESM + Express 5 (`server/app.ts`, `server/routes/*.ts`). SQLite via `node:sqlite` (`DatabaseSync` em `server/db.ts`). Queries com `db.prepare(...).get/all/run(...)`. Auth JWT HS256 + bcrypt (`server/auth.ts`, `server/routes/auth.ts`). Helmet, CORS, `express-rate-limit`.
- **Frontend**: React 19 + Vite (`src/`). Chamadas em `src/lib/api.ts` (`/api` + cookie/Bearer).
- **Banco**: arquivo SQLite em `data/` (gitignored) ou `QUADROHE_DB_PATH` (`:memory:` nos testes).
- **Pacotes**: npm. Lockfile na raiz: `package-lock.json`. Script: `npm run audit`.
- **Testes de injeção**: `tests/security/sql-injection.test.ts`.
- **Secrets**: `dotenv`. `.env` e `.env.*` no `.gitignore`; só `.env.example` versionado, com placeholders.

Não há Drizzle, Postgres, `sql.raw` nem `pool.query` neste repo. Não invente essa stack.

---

## Pilar 1 — SQL Injection

### Padrão seguro (preferir sempre)

`node:sqlite` com placeholders `?` e valores no `.get/.all/.run`:

```ts
// SEGURO — bind param
db.prepare("select * from usuarios where email = ?").get(email);
db.prepare(`select * from professores where matricula = ?`).get(req.params.matricula);
```

`WHERE`/`ORDER BY` dinâmicos só com **fragmento estático** (allowlist) + binds:

```ts
// SEGURO — SQL fixo; só o valor é externo
const where = like ? " where nome like ? collate nocase" : "";
db.prepare(`select * from escolas${where}`).all(...(like ? [like] : []));
```

```ts
// SEGURO — IN com N placeholders
const ph = ids.map(() => "?").join(",");
db.prepare(`delete from professor_licencas where id in (${ph})`).run(...ids);
```

### Bloqueie qualquer padrão como

```ts
// INSEGURO — interpola entrada no SQL
db.prepare(`select * from usuarios where email = '${req.body.email}'`).get();
db.exec(`delete from ${req.query.table}`);
db.prepare("select * from professores where nome like '%" + q + "%'").all();
```

### Regras

- Nunca concatene `req.*` (query, params, body, headers, cookies) nem variável externa dentro do texto SQL.
- `db.exec` só para SQL estático (PRAGMA, BEGIN/COMMIT, DDL de migração). Sem interpolar input.
- Identificadores (tabela, coluna, `ORDER BY`) **não** vêm do request: mapeie por **allowlist**.
- Paginação: `page`/`pageSize` numéricos com teto (já em `listQuery`).
- Erros não vazam SQL, nome de tabela/coluna nem stack ao cliente (`clientErrorMessage` em `server/httpErrors.ts`).
- Inclua ou estenda teste em `tests/security/sql-injection.test.ts` com entradas maliciosas (sem documentar passo a passo de exploit).

### Ao encontrar risco

1. Arquivo e local. 2. Qual entrada é explorável. 3. Versão com `?` + bind. 4. **Obrigatório para concluir a tarefa.**

---

## Pilar 2 — Stack e dependências vulneráveis

```bash
npm audit
npm run audit
npm audit --omit=dev --audit-level=high
npm outdated
```

### Regras

- Confirme a versão no **lockfile** (`node_modules/<pkg>` em `package-lock.json`).
- Priorize crítico/alto e explorável remotamente.
- Sugira versão segura mínima; evite major cego.
- Atenção: `jsonwebtoken`, `bcrypt`, `express`, `helmet`, `xlsx` (SheetJS via tarball oficial), `express-rate-limit`.
- Lockfile continua versionado. Sem `latest` sem pin.
- Se surgir Dockerfile/CI: imagem Node LTS, sem secret no arquivo.

---

## Pilar 3 — Segredos e credenciais expostas

Vigie: `JWT_SECRET`, `ADMIN_PASSWORD`, `ADMIN_EMAIL`, `QUADROHE_DB_PATH`, `BCRYPT_ROUNDS`, `TRUST_PROXY`.

`VITE_*` vai para o bundle e é **público**. `VITE_API_URL` pode ser URL da API; nunca senha, JWT ou hash atrás de `VITE_`.

```bash
git ls-files | grep -E '\.env'
git grep -nE "(sk_live_|secret\s*[:=]|api[_-]?key|password\s*[:=]|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY)" -- . ':!*.example' ':!tests/**'
```

### Bloqueie

- Segredo hardcoded; `.env` real no git; `JWT_SECRET` de exemplo em produção (já rejeitado em `assertAuthSecrets`).
- Log de senha, `Authorization`, cookie, TOTP secret, `senha_hash`.

### Ao encontrar segredo real

1. Avisar. 2. **Não reproduzir o valor** — mascarar. 3. Local. 4. Remover, **rotacionar**, guardar em env. 5. `.gitignore`. 6. **Obrigatório para aprovação.**

---

## Classificação

- **Crítico**: exploração direta, vazamento, credencial, RCE, bypass de auth.
- **Alto**: dados sensíveis ou pouca complexidade.
- **Médio**: contexto/config específica.
- **Baixo**: melhoria sem exploração clara.

## Fluxo

1. Contexto — Express, `node:sqlite`, npm, lockfile, env.
2. Pontos de entrada — `server/routes/api.ts`, `auth.ts`, `usuarios.ts`, imports, `listQuery`.
3. SQL Injection — concat, `exec` dinâmico, ORDER BY sem allowlist, erro vazando SQL.
4. Dependências — lockfile, `npm audit`.
5. Segredos — `.env*`, código, logs, `VITE_`.
6. Classificar e **corrigir** (não só relatar, se o usuário pediu implementação).

## Saída esperada

```md
# Revisão de Segurança da Aplicação

## Resumo
Status: Aprovado / Reprovado / Aprovado com ressalvas

## Riscos encontrados
### 1. [Título]
- Severidade / Arquivo / Local / Descrição / Impacto / Evidência
- Correção recomendada + exemplo seguro
- Obrigatório para aprovação: Sim/Não

## SQL Injection
- Queries revisadas / riscos / correções

## Dependências e stack
- Stack / dependências analisadas / vulnerabilidades / atualizações recomendadas

## Segredos e credenciais
- Arquivos analisados / segredos (mascarados) / ação / rotação necessária: Sim/Não

## Checklist final
- [ ] Queries parametrizadas (`prepare` + `?`)
- [ ] Sem concatenação insegura de SQL nem `exec` com input
- [ ] Entradas externas validadas / allowlist em identificadores e ordenação
- [ ] npm audit executado
- [ ] Vulnerabilidades críticas/altas tratadas ou com plano
- [ ] Imagem Docker / runtime Node não obsoletos (se existirem)
- [ ] Lockfile versionado
- [ ] Nenhum segredo hardcoded
- [ ] Nenhum segredo privado atrás de prefixo VITE_
- [ ] Arquivos sensíveis no .gitignore
- [ ] Secrets em env/secret manager
- [ ] Logs/erros não expõem credenciais nem queries
```

## Critérios de aceite

Aprovar só quando: sem SQL dinâmico inseguro; entrada em query parametrizada ou allowlist; vulns crítico/alto com plano; lockfile versionado; nenhuma credencial real versionada; nenhum segredo privado em `VITE_`; `.env` no `.gitignore`; secrets só em env; recomendações compatíveis com Express + `node:sqlite`.
