# QuadroHE — padrões de acesso a dados

Fonte de verdade: `server/db.ts` (`DatabaseSync` de `node:sqlite`).

## Bind params

```ts
db.prepare("select id, email, nome, papel from usuarios where email = ?").get(email);
db.prepare(
  `insert into professores (matricula, nome) values (?, ?)`,
).run(matricula, nome);
```

## Filtro LIKE (entrada do usuário)

O valor pode conter `'`; o placeholder impede injeção. Wildcards `%`/`_` no termo de busca são aceitáveis como LIKE, não como SQL.

```ts
const like = q ? `%${q}%` : null;
if (like) {
  db.prepare(`select * from escolas where nome like ? collate nocase`).all(like);
}
```

## Allowlist de filtro (não interpolar o valor do enum no SQL cru)

```ts
// statusFiltro vem do query string
if (statusFiltro === "ativas") clauses.push("ifnull(h.ativo, 1) = 1");
else if (statusFiltro === "inativas") clauses.push("ifnull(h.ativo, 1) = 0");
```

Fragmentos são literais do código. Nunca:

```ts
clauses.push(req.query.sqlWhere as string);
```

## IN dinâmico

Só placeholders gerados por `ids.map(() => "?")`. Os `ids` vão no `.run(...ids)`.

## db.exec

Permitido: `BEGIN`, `COMMIT`, `ROLLBACK`, `PRAGMA`, DDL estático em migração.

Proibido: `db.exec(\`...${req.body}...\`)`.

## Erros

Usar `clientErrorMessage(err, "Erro ao salvar")` — não `err.message` cru na API.

## Testes

`tests/security/sql-injection.test.ts` — login, busca `q`, cadastros. Estender quando criar endpoint com filtro/busca.
