import { Router, type Request } from "express";
import { v4 as uuid } from "uuid";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";
import {
  repairMojibakeText,
  repairMojibakeValue,
} from "../../src/lib/textEncoding.ts";

export const apiRouter = Router();
apiRouter.use(requireAuth);

function listQuery(req: Request) {
  const url = new URL(req.originalUrl || req.url, "http://localhost");
  const pageParam = url.searchParams.get("page");
  const paginated = pageParam !== null && pageParam !== "";
  const page = Math.max(1, Number(pageParam) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("pageSize") || 20)),
  );
  const q = (url.searchParams.get("q") || "").trim();
  const em_carencias = url.searchParams.get("em_carencias");
  return {
    paginated,
    page,
    pageSize,
    q,
    em_carencias,
    offset: (page - 1) * pageSize,
    like: q ? `%${q}%` : null,
  };
}

// Professores
apiRouter.get("/professores", (req, res) => {
  const { paginated, page, pageSize, offset, like } = listQuery(req);

  let where = "";
  const params: string[] = [];
  if (like) {
    where =
      " where nome like ? collate nocase or matricula like ? collate nocase or ifnull(cargo,'') like ? collate nocase or ifnull(funcao,'') like ? collate nocase";
    params.push(like, like, like, like);
  }

  if (!paginated) {
    return res.json(
      db
        .prepare(
          `select matricula, nome, cargo, funcao from professores${where}
           order by nome collate nocase`,
        )
        .all(...params),
    );
  }

  const total = (
    db
      .prepare(`select count(*) as c from professores${where}`)
      .get(...params) as { c: number }
  ).c;

  const items = db
    .prepare(
      `select matricula, nome, cargo, funcao from professores${where}
       order by nome collate nocase
       limit ? offset ?`,
    )
    .all(...params, pageSize, offset);

  res.json({ items, total, page, pageSize });
});

apiRouter.get("/professores/:matricula", (req, res) => {
  const professor = db
    .prepare("select * from professores where matricula = ?")
    .get(req.params.matricula);
  if (!professor) return res.status(404).json({ error: "Não encontrado" });

  const horas_extra = db
    .prepare(
      `select h.*, d.nome as disciplina_nome, d.codigo as disciplina_codigo
       from horas_extra h
       left join disciplinas d on d.id = h.disciplina_id
       where h.matricula = ?
       order by h.inicio desc`,
    )
    .all(req.params.matricula);

  const alocacoes = db
    .prepare(
      `select a.*, e.nome as escola_nome, d.nome as disciplina_nome, d.codigo as disciplina_codigo
       from alocacoes a
       left join escolas e on e.id = a.escola_id
       left join disciplinas d on d.id = a.disciplina_id
       where a.matricula = ?
       order by a.created_at desc`,
    )
    .all(req.params.matricula);

  const slots = db
    .prepare(
      `select s.*, q.turma_codigo, q.turno, q.escola_id, e.nome as escola_nome
       from quadro_slots s
       join quadros q on q.id = s.quadro_id
       left join escolas e on e.id = q.escola_id
       where s.matricula = ?
       order by e.nome, q.turma_codigo, q.turno, s.dia, s.periodo`,
    )
    .all(req.params.matricula);

  res.json({ professor, horas_extra, alocacoes, slots });
});

apiRouter.post("/professores", (req, res) => {
  const matricula = String(req.body?.matricula ?? "").trim();
  const nome = String(req.body?.nome ?? "").trim();
  const cargo = String(req.body?.cargo ?? "").trim() || null;
  const funcao = String(req.body?.funcao ?? "").trim() || null;

  if (!matricula || !nome) {
    return res.status(400).json({ error: "Matrícula e nome são obrigatórios" });
  }

  try {
    db.prepare(
      `insert into professores (matricula, nome, cargo, funcao) values (?, ?, ?, ?)`,
    ).run(matricula, nome, cargo, funcao);
    const row = db
      .prepare("select * from professores where matricula = ?")
      .get(matricula);
    return res.status(201).json(row);
  } catch {
    return res.status(409).json({ error: "Matrícula já cadastrada" });
  }
});

apiRouter.post("/professores/import", (req, res) => {
  const itens = Array.isArray(req.body?.itens) ? req.body.itens : null;
  if (!itens || itens.length === 0) {
    return res.status(400).json({ error: "Nenhum registro para importar" });
  }

  const upsertProf = db.prepare(
    `insert into professores (
       matricula, nome, cargo, funcao, cgm, dt_admiss, cod_cargo, dt_inicio,
       rescisao, escola, tipohora, cod_lotacao, lotacao, padrao, observacao,
       raca, sexo, extras
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(matricula) do update set
       nome = excluded.nome,
       cargo = coalesce(excluded.cargo, professores.cargo),
       funcao = coalesce(excluded.funcao, professores.funcao),
       cgm = coalesce(excluded.cgm, professores.cgm),
       dt_admiss = coalesce(excluded.dt_admiss, professores.dt_admiss),
       cod_cargo = coalesce(excluded.cod_cargo, professores.cod_cargo),
       dt_inicio = coalesce(excluded.dt_inicio, professores.dt_inicio),
       rescisao = coalesce(excluded.rescisao, professores.rescisao),
       escola = coalesce(excluded.escola, professores.escola),
       tipohora = coalesce(excluded.tipohora, professores.tipohora),
       cod_lotacao = coalesce(excluded.cod_lotacao, professores.cod_lotacao),
       lotacao = coalesce(excluded.lotacao, professores.lotacao),
       padrao = coalesce(excluded.padrao, professores.padrao),
       observacao = coalesce(excluded.observacao, professores.observacao),
       raca = coalesce(excluded.raca, professores.raca),
       sexo = coalesce(excluded.sexo, professores.sexo),
       extras = coalesce(excluded.extras, professores.extras),
       updated_at = datetime('now')`,
  );

  const findLotacao = db.prepare(
    `select id from professor_lotacoes
     where matricula = ?
       and ifnull(tipohora, '') = ifnull(?, '')
       and ifnull(escola, '') = ifnull(?, '')
       and ifnull(cod_lotacao, '') = ifnull(?, '')
       and ifnull(lotacao, '') = ifnull(?, '')`,
  );
  const insertLotacao = db.prepare(
    `insert into professor_lotacoes (
       id, matricula, escola, tipohora, cod_lotacao, lotacao, padrao, funcao, dt_inicio, observacao
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateLotacao = db.prepare(
    `update professor_lotacoes set
       padrao = ?, funcao = ?, dt_inicio = ?, observacao = ?, updated_at = datetime('now')
     where id = ?`,
  );

  const find = db.prepare(
    "select matricula from professores where matricula = ?",
  );

  let criados = 0;
  let atualizados = 0;
  let lotacoes = 0;
  let ignorados = 0;
  const erros: string[] = [];
  const seenMatricula = new Set<string>();

  const opt = (v: unknown) => {
    const s = repairMojibakeText(String(v ?? "").trim()) ?? "";
    return s || null;
  };

  try {
    db.exec("BEGIN");
    for (let i = 0; i < itens.length; i++) {
      const row = itens[i] ?? {};
      const matricula = String(row.matricula ?? "").trim();
      const nome = (
        repairMojibakeText(String(row.nome ?? "").trim()) ?? ""
      ).trim();
      const cargo = opt(row.cargo);
      const funcao = opt(row.funcao);
      const observacao = opt(row.observacao);
      const escola = opt(row.escola);
      const tipohora = opt(row.tipohora);
      const cod_lotacao = opt(row.cod_lotacao);
      const lotacao = opt(row.lotacao);
      const padrao = opt(row.padrao);
      const dt_inicio = opt(row.dt_inicio);
      const extras =
        row.extras && typeof row.extras === "object"
          ? JSON.stringify(repairMojibakeValue(row.extras))
          : null;

      if (!matricula || !nome) {
        ignorados += 1;
        erros.push(`Linha ${i + 1}: matrícula e nome são obrigatórios`);
        continue;
      }

      const exists = find.get(matricula);
      upsertProf.run(
        matricula,
        nome,
        cargo,
        funcao,
        opt(row.cgm),
        opt(row.dt_admiss),
        opt(row.cod_cargo),
        dt_inicio,
        opt(row.rescisao),
        escola,
        tipohora,
        cod_lotacao,
        lotacao,
        padrao,
        observacao,
        opt(row.raca),
        opt(row.sexo),
        extras,
      );

      if (!seenMatricula.has(matricula)) {
        seenMatricula.add(matricula);
        if (exists) atualizados += 1;
        else criados += 1;
      }

      // Grava lotação mesmo sem escola (tipohora ainda importa para Escolas)
      const existingLot = findLotacao.get(
        matricula,
        tipohora,
        escola,
        cod_lotacao,
        lotacao,
      ) as { id: string } | undefined;

      if (existingLot) {
        updateLotacao.run(
          padrao,
          funcao,
          dt_inicio,
          observacao,
          existingLot.id,
        );
      } else {
        insertLotacao.run(
          uuid(),
          matricula,
          escola,
          tipohora,
          cod_lotacao,
          lotacao,
          padrao,
          funcao,
          dt_inicio,
          observacao,
        );
      }
      lotacoes += 1;
    }
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Erro ao importar",
    });
  }

  return res.json({ criados, atualizados, lotacoes, ignorados, erros });
});

apiRouter.put("/professores/:matricula", (req, res) => {
  const nome = String(req.body?.nome ?? "").trim();
  const cargo = String(req.body?.cargo ?? "").trim() || null;
  const funcao = String(req.body?.funcao ?? "").trim() || null;
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });

  const result = db
    .prepare(
      `update professores set nome = ?, cargo = ?, funcao = ?, updated_at = datetime('now')
       where matricula = ?`,
    )
    .run(nome, cargo, funcao, req.params.matricula);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Não encontrado" });
  }
  const row = db
    .prepare("select * from professores where matricula = ?")
    .get(req.params.matricula);
  return res.json(row);
});

apiRouter.delete("/professores", (_req, res) => {
  const result = db.prepare("delete from professores").run();
  return res.json({ deleted: Number(result.changes) });
});

apiRouter.delete("/professores/:matricula", (req, res) => {
  const result = db
    .prepare("delete from professores where matricula = ?")
    .run(req.params.matricula);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Não encontrado" });
  }
  return res.status(204).send();
});

// Lotação: escolas a partir de professor_lotacoes (NORMAL + HORA EXTRA)
apiRouter.get("/lotacao/escolas", (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const like = q ? `%${q}%` : null;

  const where = like
    ? " where trim(ifnull(l.escola,'')) != '' and l.escola like ? collate nocase"
    : " where trim(ifnull(l.escola,'')) != ''";
  const params = like ? [like] : [];

  const items = db
    .prepare(
      `select
         trim(l.escola) as nome,
         count(*) as total,
         sum(case when upper(ifnull(l.tipohora,'')) like '%EXTRA%' then 1 else 0 end) as hora_extra,
         sum(case when upper(ifnull(l.tipohora,'')) not like '%EXTRA%' then 1 else 0 end) as normal
       from professor_lotacoes l
       ${where}
       group by trim(l.escola)
       order by trim(l.escola) collate nocase`,
    )
    .all(...params);

  res.json(items);
});

apiRouter.get("/lotacao/funcionarios", (req, res) => {
  const escola = String(req.query.escola ?? "").trim();
  if (!escola) {
    return res.status(400).json({ error: "Informe a escola" });
  }

  const q = String(req.query.q ?? "").trim();
  const where = [
    "trim(ifnull(l.escola,'')) = trim(?) collate nocase",
  ];
  const params: string[] = [escola];

  if (q) {
    where.push(
      "(p.nome like ? collate nocase or l.matricula like ? collate nocase or ifnull(p.cargo,'') like ? collate nocase or ifnull(l.funcao,'') like ? collate nocase or ifnull(p.funcao,'') like ? collate nocase)",
    );
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }

  const items = db
    .prepare(
      `select
         l.id,
         l.matricula,
         p.nome,
         p.cargo,
         coalesce(l.funcao, p.funcao) as funcao,
         l.tipohora,
         l.lotacao,
         l.padrao,
         coalesce(l.observacao, p.observacao) as observacao,
         p.dt_admiss,
         coalesce(l.dt_inicio, p.dt_inicio) as dt_inicio
       from professor_lotacoes l
       join professores p on p.matricula = l.matricula
       where ${where.join(" and ")}
       order by p.nome collate nocase, l.tipohora collate nocase`,
    )
    .all(...params);

  res.json({ escola, total: items.length, items });
});

apiRouter.get("/lotacao/contagens", (req, res) => {
  const escola = String(req.query.escola ?? "").trim();
  const unicas =
    req.query.unicas === "1" ||
    req.query.unicas === "true" ||
    req.query.unicas === "sim";

  const totalExpr = unicas ? "count(distinct l.matricula)" : "count(*)";
  const heExpr = unicas
    ? `count(distinct case when upper(ifnull(l.tipohora,'')) like '%EXTRA%' then l.matricula end)`
    : `sum(case when upper(ifnull(l.tipohora,'')) like '%EXTRA%' then 1 else 0 end)`;
  const normalExpr = unicas
    ? `count(distinct case when upper(ifnull(l.tipohora,'')) not like '%EXTRA%' then l.matricula end)`
    : `sum(case when upper(ifnull(l.tipohora,'')) not like '%EXTRA%' then 1 else 0 end)`;

  function queryCargos(filtroEscola: string | null) {
    const where = filtroEscola
      ? "where trim(ifnull(l.escola,'')) = trim(?) collate nocase"
      : "where trim(ifnull(l.escola,'')) != ''";
    const params = filtroEscola ? [filtroEscola] : [];
    return db
      .prepare(
        `select
           trim(l.escola) as escola,
           case
             when trim(ifnull(p.cargo, '')) = '' then '(vazio)'
             else trim(p.cargo)
           end as nome,
           ${totalExpr} as total,
           ${heExpr} as hora_extra,
           ${normalExpr} as normal
         from professor_lotacoes l
         join professores p on p.matricula = l.matricula
         ${where}
         group by 1, 2
         order by total desc, nome collate nocase`,
      )
      .all(...params) as Array<{
      escola: string;
      nome: string;
      total: number;
      hora_extra: number;
      normal: number;
    }>;
  }

  function queryFuncoes(filtroEscola: string | null) {
    const where = filtroEscola
      ? "where trim(ifnull(l.escola,'')) = trim(?) collate nocase"
      : "where trim(ifnull(l.escola,'')) != ''";
    const params = filtroEscola ? [filtroEscola] : [];
    return db
      .prepare(
        `select
           trim(l.escola) as escola,
           case
             when trim(ifnull(coalesce(l.funcao, p.funcao), '')) = '' then '(vazio)'
             else trim(coalesce(l.funcao, p.funcao))
           end as nome,
           ${totalExpr} as total,
           ${heExpr} as hora_extra,
           ${normalExpr} as normal
         from professor_lotacoes l
         join professores p on p.matricula = l.matricula
         ${where}
         group by 1, 2
         order by total desc, nome collate nocase`,
      )
      .all(...params) as Array<{
      escola: string;
      nome: string;
      total: number;
      hora_extra: number;
      normal: number;
    }>;
  }

  function queryTotaisEscola(filtroEscola: string | null) {
    const where = filtroEscola
      ? "where trim(ifnull(l.escola,'')) = trim(?) collate nocase"
      : "where trim(ifnull(l.escola,'')) != ''";
    const params = filtroEscola ? [filtroEscola] : [];
    return db
      .prepare(
        `select
           trim(l.escola) as escola,
           ${totalExpr} as total,
           ${heExpr} as hora_extra,
           ${normalExpr} as normal
         from professor_lotacoes l
         ${where}
         group by 1
         order by total desc, escola collate nocase`,
      )
      .all(...params) as Array<{
      escola: string;
      total: number;
      hora_extra: number;
      normal: number;
    }>;
  }

  if (escola) {
    const totais = queryTotaisEscola(escola)[0];
    const cargos = queryCargos(escola).map(
      ({ nome, total, hora_extra, normal }) => ({
        nome,
        total: Number(total),
        hora_extra: Number(hora_extra),
        normal: Number(normal),
      }),
    );
    const funcoes = queryFuncoes(escola).map(
      ({ nome, total, hora_extra, normal }) => ({
        nome,
        total: Number(total),
        hora_extra: Number(hora_extra),
        normal: Number(normal),
      }),
    );
    return res.json({
      escola,
      unicas,
      total: Number(totais?.total ?? 0),
      normal: Number(totais?.normal ?? 0),
      hora_extra: Number(totais?.hora_extra ?? 0),
      cargos,
      funcoes,
    });
  }

  type Item = {
    nome: string;
    total: number;
    hora_extra: number;
    normal: number;
  };
  type EscolaBag = {
    nome: string;
    total: number;
    hora_extra: number;
    normal: number;
    cargos: Item[];
    funcoes: Item[];
  };

  const map = new Map<string, EscolaBag>();

  function ensure(nome: string) {
    const key = nome.trim();
    let e = map.get(key);
    if (!e) {
      e = {
        nome: key,
        total: 0,
        hora_extra: 0,
        normal: 0,
        cargos: [],
        funcoes: [],
      };
      map.set(key, e);
    }
    return e;
  }

  for (const row of queryTotaisEscola(null)) {
    const e = ensure(row.escola);
    e.total = Number(row.total);
    e.hora_extra = Number(row.hora_extra);
    e.normal = Number(row.normal);
  }

  for (const row of queryCargos(null)) {
    const e = ensure(row.escola);
    e.cargos.push({
      nome: row.nome,
      total: Number(row.total),
      hora_extra: Number(row.hora_extra),
      normal: Number(row.normal),
    });
  }

  for (const row of queryFuncoes(null)) {
    const e = ensure(row.escola);
    e.funcoes.push({
      nome: row.nome,
      total: Number(row.total),
      hora_extra: Number(row.hora_extra),
      normal: Number(row.normal),
    });
  }

  const escolas = [...map.values()].sort(
    (a, b) =>
      b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"),
  );

  const total = escolas.reduce((acc, e) => acc + e.total, 0);
  const hora_extra = escolas.reduce((acc, e) => acc + e.hora_extra, 0);
  const normal = escolas.reduce((acc, e) => acc + e.normal, 0);

  res.json({ total, normal, hora_extra, unicas, escolas });
});

apiRouter.get("/lotacao/opcoes", (_req, res) => {
  const fromLotacoes = db
    .prepare(
      `select distinct trim(lotacao) as nome
       from professor_lotacoes
       where trim(ifnull(lotacao, '')) != ''
       order by trim(lotacao) collate nocase`,
    )
    .all() as Array<{ nome: string }>;

  const fromHe = db
    .prepare(
      `select distinct trim(lotacao_origem) as nome
       from horas_extra
       where trim(ifnull(lotacao_origem, '')) != ''
       order by trim(lotacao_origem) collate nocase`,
    )
    .all() as Array<{ nome: string }>;

  const set = new Set<string>();
  for (const row of [...fromLotacoes, ...fromHe]) {
    const n = String(row.nome ?? "").trim();
    if (n) set.add(n);
  }
  const items = [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  res.json(items);
});

// Escolas
apiRouter.get("/escolas", (req, res) => {
  const { paginated, page, pageSize, offset, like, em_carencias } =
    listQuery(req);

  const where: string[] = [];
  const params: Array<string | number> = [];

  if (em_carencias === "1" || em_carencias === "true") {
    where.push("em_carencias = 1");
  } else if (em_carencias === "0" || em_carencias === "false") {
    where.push("em_carencias = 0");
  }
  if (like) {
    where.push("nome like ? collate nocase");
    params.push(like);
  }

  const whereSql = where.length ? ` where ${where.join(" and ")}` : "";

  if (!paginated) {
    return res.json(
      db
        .prepare(
          `select * from escolas${whereSql} order by nome collate nocase`,
        )
        .all(...params),
    );
  }

  const total = (
    db
      .prepare(`select count(*) as c from escolas${whereSql}`)
      .get(...params) as { c: number }
  ).c;

  const items = db
    .prepare(
      `select * from escolas${whereSql}
       order by nome collate nocase
       limit ? offset ?`,
    )
    .all(...params, pageSize, offset);

  res.json({ items, total, page, pageSize });
});

apiRouter.get("/carencias/escolas", (_req, res) => {
  res.json(
    db
      .prepare(
        "select * from escolas where em_carencias = 1 order by nome collate nocase",
      )
      .all(),
  );
});

apiRouter.get("/carencias/escolas-resumo", (_req, res) => {
  const rows = db
    .prepare(
      `select e.*,
              (select count(*) from quadros q where q.escola_id = e.id) as quadros,
              (select count(*)
                 from quadro_slots s
                 join quadros q on q.id = s.quadro_id
                where q.escola_id = e.id and s.matricula is null) as abertos
       from escolas e
       where e.em_carencias = 1
       order by e.nome collate nocase`,
    )
    .all() as Array<Record<string, unknown> & { id: string }>;

  const porDisc = db
    .prepare(
      `select
         q.escola_id as escola_id,
         coalesce(nullif(trim(d.codigo), ''), '—') as codigo,
         coalesce(d.nome, '(sem matéria)') as nome,
         count(*) as abertos
       from quadro_slots s
       join quadros q on q.id = s.quadro_id
       left join disciplinas d on d.id = q.disciplina_id
       where s.matricula is null
         and q.escola_id in (select id from escolas where em_carencias = 1)
       group by q.escola_id, d.id, d.codigo, d.nome
       order by abertos desc, nome collate nocase`,
    )
    .all() as Array<{
    escola_id: string;
    codigo: string;
    nome: string;
    abertos: number;
  }>;

  const map = new Map<
    string,
    Array<{ codigo: string; nome: string; abertos: number }>
  >();
  for (const row of porDisc) {
    const list = map.get(row.escola_id) ?? [];
    list.push({
      codigo: row.codigo,
      nome: row.nome,
      abertos: Number(row.abertos),
    });
    map.set(row.escola_id, list);
  }

  res.json(
    rows.map((e) => ({
      ...e,
      por_disciplina: map.get(e.id) ?? [],
    })),
  );
});

apiRouter.get("/carencias/contagens", (_req, res) => {
  const porEscola = db
    .prepare(
      `select
         coalesce(d.id, '') as disciplina_id,
         coalesce(nullif(trim(d.codigo), ''), '—') as codigo,
         coalesce(d.nome, '(sem matéria)') as nome,
         e.id as escola_id,
         e.nome as escola_nome,
         count(*) as abertos
       from quadro_slots s
       join quadros q on q.id = s.quadro_id
       join escolas e on e.id = q.escola_id
       left join disciplinas d on d.id = q.disciplina_id
       where s.matricula is null
         and e.em_carencias = 1
       group by d.id, d.codigo, d.nome, e.id, e.nome
       order by nome collate nocase, escola_nome collate nocase`,
    )
    .all() as Array<{
    disciplina_id: string;
    codigo: string;
    nome: string;
    escola_id: string;
    escola_nome: string;
    abertos: number;
  }>;

  const map = new Map<
    string,
    {
      disciplina_id: string;
      codigo: string;
      nome: string;
      abertos: number;
      escolas: Array<{
        escola_id: string;
        escola_nome: string;
        abertos: number;
      }>;
    }
  >();

  const mapEscolas = new Map<
    string,
    {
      escola_id: string;
      escola_nome: string;
      abertos: number;
      disciplinas: Array<{
        disciplina_id: string;
        codigo: string;
        nome: string;
        abertos: number;
      }>;
    }
  >();

  for (const row of porEscola) {
    const key = row.disciplina_id || `__${row.codigo}|${row.nome}`;
    const item = map.get(key) ?? {
      disciplina_id: row.disciplina_id,
      codigo: row.codigo,
      nome: row.nome,
      abertos: 0,
      escolas: [],
    };
    const abertos = Number(row.abertos);
    item.abertos += abertos;
    item.escolas.push({
      escola_id: row.escola_id,
      escola_nome: row.escola_nome,
      abertos,
    });
    map.set(key, item);

    const escola = mapEscolas.get(row.escola_id) ?? {
      escola_id: row.escola_id,
      escola_nome: row.escola_nome,
      abertos: 0,
      disciplinas: [],
    };
    escola.abertos += abertos;
    escola.disciplinas.push({
      disciplina_id: row.disciplina_id,
      codigo: row.codigo,
      nome: row.nome,
      abertos,
    });
    mapEscolas.set(row.escola_id, escola);
  }

  const disciplinas = [...map.values()]
    .map((d) => ({
      ...d,
      escolas: d.escolas.sort(
        (a, b) =>
          b.abertos - a.abertos ||
          a.escola_nome.localeCompare(b.escola_nome, "pt-BR"),
      ),
    }))
    .sort(
      (a, b) =>
        b.abertos - a.abertos || a.nome.localeCompare(b.nome, "pt-BR"),
    );

  const escolas = [...mapEscolas.values()]
    .map((e) => ({
      ...e,
      disciplinas: e.disciplinas.sort(
        (a, b) =>
          b.abertos - a.abertos || a.nome.localeCompare(b.nome, "pt-BR"),
      ),
    }))
    .sort(
      (a, b) =>
        b.abertos - a.abertos ||
        a.escola_nome.localeCompare(b.escola_nome, "pt-BR"),
    );

  const total_abertos = disciplinas.reduce((acc, d) => acc + d.abertos, 0);
  res.json({ total_abertos, disciplinas, escolas });
});

apiRouter.get("/carencias/escolas-disponiveis", (_req, res) => {
  res.json(
    db
      .prepare(
        "select * from escolas where em_carencias = 0 order by nome collate nocase",
      )
      .all(),
  );
});

/**
 * Importa carências a partir de itens já parseados da planilha visual
 * (escola × turma × turno × dia × período × disciplina).
 * Cria/ativa escolas, cria/reusa quadros e abre slots sem professor.
 */
apiRouter.post("/carencias/import", (req, res) => {
  const itens = Array.isArray(req.body?.itens) ? req.body.itens : null;
  if (!itens || itens.length === 0) {
    return res.status(400).json({ error: "Nenhum registro para importar" });
  }

  const findEscola = db.prepare(
    "select id, em_carencias from escolas where nome = ? collate nocase",
  );
  const insertEscola = db.prepare(
    "insert into escolas (id, nome, em_carencias) values (?, ?, 1)",
  );
  const activateEscola = db.prepare(
    "update escolas set em_carencias = 1 where id = ?",
  );
  const findDisc = db.prepare(
    "select id from disciplinas where codigo = ? collate nocase",
  );
  const findQuadro = db.prepare(
    `select id from quadros
     where escola_id = ? and turma_codigo = ? collate nocase and turno = ?
       and (
         (? is null and disciplina_id is null)
         or disciplina_id = ?
       )`,
  );
  const insertQuadro = db.prepare(
    `insert into quadros (id, escola_id, turma_codigo, turno, disciplina_id, observacao)
     values (?, ?, ?, ?, ?, ?)`,
  );
  const updateObs = db.prepare(
    `update quadros set observacao = coalesce(nullif(observacao, ''), ?),
     updated_at = datetime('now') where id = ?`,
  );
  const findSlot = db.prepare(
    "select id from quadro_slots where quadro_id = ? and dia = ? and periodo = ?",
  );
  const insertSlot = db.prepare(
    `insert into quadro_slots (id, quadro_id, dia, periodo, tipo, expira_em)
     values (?, ?, ?, ?, 'REAL', null)`,
  );

  let escolas_criadas = 0;
  let escolas_ativadas = 0;
  let quadros_criados = 0;
  let slots_criados = 0;
  let slots_existentes = 0;
  let ignorados = 0;
  const erros: string[] = [];
  const escolaCache = new Map<string, string>();
  const discCache = new Map<string, string | null>();
  const quadroCache = new Map<string, string>();

  function resolveDisc(codigoRaw: string): string | null {
    let codigo = String(codigoRaw || "PT").trim().toUpperCase();
    if (codigo === "LP") codigo = "PT";
    if (discCache.has(codigo)) return discCache.get(codigo) ?? null;
    const row = findDisc.get(codigo) as { id: string } | undefined;
    const id = row?.id ?? null;
    discCache.set(codigo, id);
    if (!id) {
      erros.push(`Disciplina não cadastrada: ${codigo}`);
    }
    return id;
  }

  function resolveEscola(nome: string): string | null {
    const key = nome.toLowerCase();
    const cached = escolaCache.get(key);
    if (cached) return cached;
    const existing = findEscola.get(nome) as
      | { id: string; em_carencias: number }
      | undefined;
    if (existing) {
      if (!existing.em_carencias) {
        activateEscola.run(existing.id);
        escolas_ativadas += 1;
      }
      escolaCache.set(key, existing.id);
      return existing.id;
    }
    const id = uuid();
    insertEscola.run(id, nome);
    escolas_criadas += 1;
    escolaCache.set(key, id);
    return id;
  }

  try {
    db.exec("BEGIN");
    for (let i = 0; i < itens.length; i++) {
      const raw = itens[i];
      const escola = String(raw?.escola ?? "").trim();
      const turma_codigo = String(raw?.turma_codigo ?? "").trim();
      const turno = String(raw?.turno ?? "").trim().toUpperCase();
      const dia = Number(raw?.dia);
      const periodo = Number(raw?.periodo);
      const disciplina_codigo = String(raw?.disciplina_codigo ?? "PT").trim();
      const observacao = String(raw?.observacao ?? "").trim() || null;

      if (!escola || !turma_codigo) {
        ignorados += 1;
        erros.push(`Linha ${i + 1}: escola e turma são obrigatórios`);
        continue;
      }
      if (!["MANHA", "TARDE", "NOITE"].includes(turno)) {
        ignorados += 1;
        erros.push(`Linha ${i + 1}: turno inválido (${turno})`);
        continue;
      }
      if (!Number.isInteger(dia) || dia < 1 || dia > 5) {
        ignorados += 1;
        erros.push(`Linha ${i + 1}: dia inválido`);
        continue;
      }
      if (!Number.isInteger(periodo) || periodo < 1 || periodo > 6) {
        ignorados += 1;
        erros.push(`Linha ${i + 1}: período inválido`);
        continue;
      }

      const escola_id = resolveEscola(escola);
      if (!escola_id) {
        ignorados += 1;
        continue;
      }

      const disciplina_id = resolveDisc(disciplina_codigo);
      const qKey = `${escola_id}|${turma_codigo.toLowerCase()}|${turno}|${disciplina_id ?? "null"}`;
      let quadro_id = quadroCache.get(qKey);
      if (!quadro_id) {
        const existing = findQuadro.get(
          escola_id,
          turma_codigo,
          turno,
          disciplina_id,
          disciplina_id,
        ) as { id: string } | undefined;
        if (existing) {
          quadro_id = existing.id;
          if (observacao) updateObs.run(observacao, quadro_id);
        } else {
          quadro_id = uuid();
          insertQuadro.run(
            quadro_id,
            escola_id,
            turma_codigo,
            turno,
            disciplina_id,
            observacao,
          );
          quadros_criados += 1;
        }
        quadroCache.set(qKey, quadro_id);
      }

      const slot = findSlot.get(quadro_id, dia, periodo) as
        | { id: string }
        | undefined;
      if (slot) {
        slots_existentes += 1;
      } else {
        insertSlot.run(uuid(), quadro_id, dia, periodo);
        slots_criados += 1;
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Erro ao importar",
    });
  }

  return res.json({
    escolas_criadas,
    escolas_ativadas,
    quadros_criados,
    slots_criados,
    slots_existentes,
    ignorados,
    erros: [...new Set(erros)].slice(0, 50),
  });
});

apiRouter.post("/escolas", (req, res) => {
  const nome = String(req.body?.nome ?? "").trim();
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
  const em_carencias = req.body?.em_carencias ? 1 : 0;
  const id = uuid();
  try {
    db.prepare(
      "insert into escolas (id, nome, em_carencias) values (?, ?, ?)",
    ).run(id, nome, em_carencias);
    return res
      .status(201)
      .json(db.prepare("select * from escolas where id = ?").get(id));
  } catch {
    return res.status(409).json({ error: "Escola já cadastrada" });
  }
});

apiRouter.post("/escolas/import", (req, res) => {
  const itens = Array.isArray(req.body?.itens) ? req.body.itens : null;
  if (!itens || itens.length === 0) {
    return res.status(400).json({ error: "Nenhum registro para importar" });
  }

  const findByNome = db.prepare(
    "select id from escolas where nome = ? collate nocase",
  );
  const insert = db.prepare(
    "insert into escolas (id, nome, em_carencias) values (?, ?, 0)",
  );

  let criados = 0;
  let ignorados = 0;
  const erros: string[] = [];

  try {
    db.exec("BEGIN");
    for (let i = 0; i < itens.length; i++) {
      const nome = String(itens[i]?.nome ?? "").trim();
      if (!nome) {
        ignorados += 1;
        erros.push(`Linha ${i + 1}: nome da escola é obrigatório`);
        continue;
      }
      if (findByNome.get(nome)) {
        ignorados += 1;
        continue;
      }
      insert.run(uuid(), nome);
      criados += 1;
    }
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Erro ao importar",
    });
  }

  return res.json({ criados, atualizados: 0, ignorados, erros });
});

apiRouter.put("/escolas/:id", (req, res) => {
  const nome = String(req.body?.nome ?? "").trim();
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
  try {
    const result = db
      .prepare("update escolas set nome = ? where id = ?")
      .run(nome, req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Não encontrado" });
    }
    return res.json(
      db.prepare("select * from escolas where id = ?").get(req.params.id),
    );
  } catch {
    return res.status(409).json({ error: "Nome já utilizado" });
  }
});

apiRouter.patch("/escolas/:id/carencias", (req, res) => {
  const ativa = Boolean(req.body?.ativa);
  const escola = db
    .prepare("select id from escolas where id = ?")
    .get(req.params.id);
  if (!escola) {
    return res.status(404).json({ error: "Não encontrado" });
  }

  if (!ativa) {
    // Sai da lista de carências: apaga quadros (slots caem em cascade)
    db.prepare("delete from quadros where escola_id = ?").run(req.params.id);
  }

  db.prepare("update escolas set em_carencias = ? where id = ?").run(
    ativa ? 1 : 0,
    req.params.id,
  );

  return res.json(
    db.prepare("select * from escolas where id = ?").get(req.params.id),
  );
});

apiRouter.delete("/escolas/:id", (req, res) => {
  const result = db
    .prepare("delete from escolas where id = ?")
    .run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Não encontrado" });
  }
  return res.status(204).send();
});

// Disciplinas
apiRouter.get("/disciplinas", (_req, res) => {
  res.json(
    db.prepare("select * from disciplinas order by nome collate nocase").all(),
  );
});

apiRouter.post("/disciplinas", (req, res) => {
  const nome = String(req.body?.nome ?? "").trim();
  const codigo = String(req.body?.codigo ?? "")
    .trim()
    .toUpperCase();
  if (!nome || !codigo) {
    return res.status(400).json({ error: "Nome e código são obrigatórios" });
  }
  const id = uuid();
  try {
    db.prepare("insert into disciplinas (id, nome, codigo) values (?, ?, ?)").run(
      id,
      nome,
      codigo,
    );
    return res
      .status(201)
      .json(db.prepare("select * from disciplinas where id = ?").get(id));
  } catch {
    return res.status(409).json({ error: "Código já cadastrado" });
  }
});

apiRouter.put("/disciplinas/:id", (req, res) => {
  const nome = String(req.body?.nome ?? "").trim();
  const codigo = String(req.body?.codigo ?? "")
    .trim()
    .toUpperCase();
  if (!nome || !codigo) {
    return res.status(400).json({ error: "Nome e código são obrigatórios" });
  }
  try {
    const result = db
      .prepare("update disciplinas set nome = ?, codigo = ? where id = ?")
      .run(nome, codigo, req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Não encontrado" });
    }
    return res.json(
      db.prepare("select * from disciplinas where id = ?").get(req.params.id),
    );
  } catch {
    return res.status(409).json({ error: "Código já utilizado" });
  }
});

apiRouter.delete("/disciplinas/:id", (req, res) => {
  const result = db
    .prepare("delete from disciplinas where id = ?")
    .run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Não encontrado" });
  }
  return res.status(204).send();
});

// Hora Extra
apiRouter.get("/horas-extra", (req, res) => {
  const { paginated, page, pageSize, offset, like } = listQuery(req);

  let where = "";
  const params: string[] = [];
  if (like) {
    where = ` where h.matricula like ? collate nocase
      or ifnull(p.nome,'') like ? collate nocase
      or ifnull(h.memo,'') like ? collate nocase
      or ifnull(h.observacao,'') like ? collate nocase
      or ifnull(h.lotacao_origem,'') like ? collate nocase
      or h.tipo like ? collate nocase`;
    params.push(like, like, like, like, like, like);
  }

  const baseFrom = `from horas_extra h
       left join professores p on p.matricula = h.matricula
       left join disciplinas d on d.id = h.disciplina_id`;

  if (!paginated) {
    return res.json(
      db
        .prepare(
          `select h.*, p.nome as professor_nome, p.cargo as professor_cargo,
                  p.funcao as professor_funcao,
                  d.nome as disciplina_nome, d.codigo as disciplina_codigo
           ${baseFrom}${where}
           order by h.created_at desc`,
        )
        .all(...params),
    );
  }

  const total = (
    db
      .prepare(`select count(*) as c ${baseFrom}${where}`)
      .get(...params) as { c: number }
  ).c;

  const items = db
    .prepare(
      `select h.*, p.nome as professor_nome, p.cargo as professor_cargo,
              p.funcao as professor_funcao,
              d.nome as disciplina_nome, d.codigo as disciplina_codigo
       ${baseFrom}${where}
       order by h.created_at desc
       limit ? offset ?`,
    )
    .all(...params, pageSize, offset);

  res.json({ items, total, page, pageSize });
});

apiRouter.post("/horas-extra", (req, res) => {
  const matricula = String(req.body?.matricula ?? "").trim();
  const nome = String(req.body?.nome ?? "").trim();
  const cargo = String(req.body?.cargo ?? "").trim() || null;
  const funcao = String(req.body?.funcao ?? "").trim() || null;
  const tempos = Number(req.body?.tempos_autorizados);
  const unidadeRaw = String(req.body?.unidade ?? "TEMPOS")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  const unidade = unidadeRaw.includes("HORA") ? "HORAS" : "TEMPOS";

  if (!matricula || !nome || !Number.isFinite(tempos) || tempos <= 0) {
    return res
      .status(400)
      .json({ error: "Matrícula, funcionário e nº de tempos são obrigatórios" });
  }

  const id = uuid();
  try {
    const exists = db
      .prepare("select matricula from professores where matricula = ?")
      .get(matricula);
    if (exists) {
      db.prepare(
        `update professores set
           nome = ?, cargo = coalesce(?, cargo), funcao = coalesce(?, funcao),
           updated_at = datetime('now')
         where matricula = ?`,
      ).run(nome, cargo, funcao, matricula);
    } else {
      db.prepare(
        `insert into professores (matricula, nome, cargo, funcao) values (?, ?, ?, ?)`,
      ).run(matricula, nome, cargo, funcao);
    }

    db.prepare(
      `insert into horas_extra
       (id, matricula, disciplina_id, tempos_autorizados, tipo, inicio, termino, memo, observacao, lotacao_origem, unidade)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      matricula,
      req.body?.disciplina_id || null,
      tempos,
      req.body?.tipo || "REAL",
      req.body?.inicio || null,
      req.body?.termino || null,
      String(req.body?.memo ?? "").trim() || null,
      String(req.body?.observacao ?? "").trim() || null,
      String(req.body?.lotacao_origem ?? "").trim() || null,
      unidade,
    );
    return res.status(201).json(
      db.prepare("select * from horas_extra where id = ?").get(id),
    );
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error ? err.message : "Erro ao salvar",
    });
  }
});

apiRouter.post("/horas-extra/import", (req, res) => {
  const itens = Array.isArray(req.body?.itens) ? req.body.itens : null;
  if (!itens || itens.length === 0) {
    return res.status(400).json({ error: "Nenhum registro para importar" });
  }

  const findProf = db.prepare(
    "select matricula from professores where matricula = ?",
  );
  const insertProf = db.prepare(
    `insert into professores (matricula, nome, cargo, funcao) values (?, ?, ?, ?)`,
  );
  const updateProf = db.prepare(
    `update professores set
       nome = coalesce(?, nome),
       cargo = coalesce(?, cargo),
       funcao = coalesce(?, funcao),
       updated_at = datetime('now')
     where matricula = ?`,
  );
  const insertHe = db.prepare(
    `insert into horas_extra
     (id, matricula, disciplina_id, tempos_autorizados, tipo, inicio, termino, memo, observacao, lotacao_origem, unidade)
     values (?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  let criados = 0;
  let ignorados = 0;
  const erros: string[] = [];

  try {
    db.exec("BEGIN");
    for (let i = 0; i < itens.length; i++) {
      const row = itens[i] ?? {};
      const matricula = String(row.matricula ?? "").trim();
      const nome = String(row.nome ?? "").trim() || null;
      const cargo = String(row.cargo ?? "").trim() || null;
      const funcao = String(row.funcao ?? "").trim() || null;
      const lotacao = String(row.lotacao_origem ?? "").trim() || null;
      const memo = String(row.memo ?? "").trim() || null;
      const observacao = String(row.observacao ?? "").trim() || null;
      const inicio = String(row.inicio ?? "").trim() || null;
      const termino = String(row.termino ?? "").trim() || null;
      const tipoRaw = String(row.tipo ?? "REAL")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toUpperCase();
      const tipo =
        tipoRaw.includes("TEMPOR") || tipoRaw === "T" ? "TEMPORARIA" : "REAL";
      const tempos = Number(row.tempos_autorizados);
      const unidadeRaw = String(row.unidade ?? "TEMPOS")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toUpperCase();
      const unidade = unidadeRaw.includes("HORA")
        ? "HORAS"
        : unidadeRaw.includes("TEMPO") || !unidadeRaw
          ? "TEMPOS"
          : unidadeRaw.slice(0, 40);

      if (!matricula && !nome && !Number.isFinite(tempos)) {
        continue;
      }
      if (!matricula) {
        ignorados += 1;
        erros.push(`Linha ${i + 1}: matrícula obrigatória`);
        continue;
      }
      if (!Number.isFinite(tempos) || tempos <= 0) {
        ignorados += 1;
        erros.push(`Linha ${i + 1}: nº de tempos/horas inválido`);
        continue;
      }

      const exists = findProf.get(matricula);
      if (!exists) {
        if (!nome) {
          ignorados += 1;
          erros.push(
            `Linha ${i + 1}: professor ${matricula} não cadastrado e sem nome (FUNCIONÁRIO)`,
          );
          continue;
        }
        insertProf.run(matricula, nome, cargo, funcao);
      } else if (nome || cargo || funcao) {
        updateProf.run(nome, cargo, funcao, matricula);
      }

      insertHe.run(
        uuid(),
        matricula,
        tempos,
        tipo,
        inicio,
        termino,
        memo,
        observacao,
        lotacao,
        unidade,
      );
      criados += 1;
    }
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Erro ao importar",
    });
  }

  return res.json({ criados, atualizados: 0, ignorados, erros });
});

apiRouter.put("/horas-extra/:id", (req, res) => {
  const matricula = String(req.body?.matricula ?? "").trim();
  const nome = String(req.body?.nome ?? "").trim();
  const cargo = String(req.body?.cargo ?? "").trim() || null;
  const funcao = String(req.body?.funcao ?? "").trim() || null;
  const tempos = Number(req.body?.tempos_autorizados);
  const unidadeRaw = String(req.body?.unidade ?? "TEMPOS")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  const unidade = unidadeRaw.includes("HORA") ? "HORAS" : "TEMPOS";

  if (!matricula || !nome || !Number.isFinite(tempos) || tempos <= 0) {
    return res
      .status(400)
      .json({ error: "Matrícula, funcionário e nº de tempos são obrigatórios" });
  }

  try {
    const exists = db
      .prepare("select matricula from professores where matricula = ?")
      .get(matricula);
    if (exists) {
      db.prepare(
        `update professores set
           nome = ?, cargo = coalesce(?, cargo), funcao = coalesce(?, funcao),
           updated_at = datetime('now')
         where matricula = ?`,
      ).run(nome, cargo, funcao, matricula);
    } else {
      db.prepare(
        `insert into professores (matricula, nome, cargo, funcao) values (?, ?, ?, ?)`,
      ).run(matricula, nome, cargo, funcao);
    }

    const result = db
      .prepare(
        `update horas_extra set
          matricula = ?, disciplina_id = ?, tempos_autorizados = ?, tipo = ?,
          inicio = ?, termino = ?, memo = ?, observacao = ?, lotacao_origem = ?,
          unidade = ?, updated_at = datetime('now')
         where id = ?`,
      )
      .run(
        matricula,
        req.body?.disciplina_id || null,
        tempos,
        req.body?.tipo || "REAL",
        req.body?.inicio || null,
        req.body?.termino || null,
        String(req.body?.memo ?? "").trim() || null,
        String(req.body?.observacao ?? "").trim() || null,
        String(req.body?.lotacao_origem ?? "").trim() || null,
        unidade,
        req.params.id,
      );
    if (result.changes === 0) {
      return res.status(404).json({ error: "Não encontrado" });
    }
    return res.json(
      db.prepare("select * from horas_extra where id = ?").get(req.params.id),
    );
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error ? err.message : "Erro ao salvar",
    });
  }
});

apiRouter.delete("/horas-extra", (_req, res) => {
  const result = db.prepare("delete from horas_extra").run();
  return res.json({ deleted: Number(result.changes) });
});

apiRouter.delete("/horas-extra/:id", (req, res) => {
  const result = db
    .prepare("delete from horas_extra where id = ?")
    .run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Não encontrado" });
  }
  return res.status(204).send();
});

// Alocações
apiRouter.get("/alocacoes", (_req, res) => {
  const rows = db
    .prepare(
      `select a.*, p.nome as professor_nome, e.nome as escola_nome,
              d.nome as disciplina_nome, d.codigo as disciplina_codigo
       from alocacoes a
       left join professores p on p.matricula = a.matricula
       left join escolas e on e.id = a.escola_id
       left join disciplinas d on d.id = a.disciplina_id
       order by a.created_at desc`,
    )
    .all();
  res.json(rows);
});

apiRouter.post("/alocacoes", (req, res) => {
  const matricula = String(req.body?.matricula ?? "").trim();
  const escola_id = String(req.body?.escola_id ?? "").trim();
  const tempos = Number(req.body?.tempos);
  if (!matricula || !escola_id || !Number.isFinite(tempos) || tempos <= 0) {
    return res.status(400).json({ error: "Dados inválidos" });
  }
  const id = uuid();
  try {
    db.prepare(
      `insert into alocacoes
       (id, matricula, escola_id, disciplina_id, turno, tempos, turma_codigo, status)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      matricula,
      escola_id,
      req.body?.disciplina_id || null,
      req.body?.turno || "MANHA",
      tempos,
      String(req.body?.turma_codigo ?? "").trim() || null,
      req.body?.status || "ATIVA",
    );
    return res
      .status(201)
      .json(db.prepare("select * from alocacoes where id = ?").get(id));
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error ? err.message : "Erro ao salvar",
    });
  }
});

apiRouter.put("/alocacoes/:id", (req, res) => {
  const tempos = Number(req.body?.tempos);
  if (!Number.isFinite(tempos) || tempos <= 0) {
    return res.status(400).json({ error: "Tempos inválidos" });
  }
  try {
    const result = db
      .prepare(
        `update alocacoes set
          matricula = ?, escola_id = ?, disciplina_id = ?, turno = ?,
          tempos = ?, turma_codigo = ?, status = ?, updated_at = datetime('now')
         where id = ?`,
      )
      .run(
        String(req.body?.matricula ?? "").trim(),
        String(req.body?.escola_id ?? "").trim(),
        req.body?.disciplina_id || null,
        req.body?.turno || "MANHA",
        tempos,
        String(req.body?.turma_codigo ?? "").trim() || null,
        req.body?.status || "ATIVA",
        req.params.id,
      );
    if (result.changes === 0) {
      return res.status(404).json({ error: "Não encontrado" });
    }
    return res.json(
      db.prepare("select * from alocacoes where id = ?").get(req.params.id),
    );
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error ? err.message : "Erro ao salvar",
    });
  }
});

apiRouter.delete("/alocacoes/:id", (req, res) => {
  const result = db
    .prepare("delete from alocacoes where id = ?")
    .run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Não encontrado" });
  }
  return res.status(204).send();
});

// Quadros por turma da escola
apiRouter.get("/escolas/:id/quadros", (req, res) => {
  const escola = db
    .prepare("select * from escolas where id = ?")
    .get(req.params.id);
  if (!escola) return res.status(404).json({ error: "Escola não encontrada" });

  const quadros = db
    .prepare(
      `select q.*,
              d.nome as disciplina_nome, d.codigo as disciplina_codigo,
              (select count(*) from quadro_slots s where s.quadro_id = q.id) as total_slots,
              (select count(*) from quadro_slots s where s.quadro_id = q.id and s.matricula is null) as slots_abertos
       from quadros q
       left join disciplinas d on d.id = q.disciplina_id
       where q.escola_id = ?
       order by q.turno, q.turma_codigo collate nocase`,
    )
    .all(req.params.id) as Array<Record<string, unknown> & { id: string }>;

  const slotsStmt = db.prepare(
    `select dia, periodo, matricula, tipo from quadro_slots where quadro_id = ?`,
  );

  const comPreview = quadros.map((q) => ({
    ...q,
    slots_preview: slotsStmt.all(q.id),
  }));

  res.json({ escola, quadros: comPreview });
});

apiRouter.post("/escolas/:id/quadros", (req, res) => {
  const escola_id = req.params.id;
  const escola = db.prepare("select id from escolas where id = ?").get(escola_id);
  if (!escola) return res.status(404).json({ error: "Escola não encontrada" });

  const turma_codigo = String(req.body?.turma_codigo ?? "").trim();
  const turno = String(req.body?.turno ?? "");
  const disciplina_id = req.body?.disciplina_id || null;
  const observacao = String(req.body?.observacao ?? "").trim() || null;

  if (!turma_codigo) {
    return res.status(400).json({ error: "Informe o código da turma" });
  }
  if (!["MANHA", "TARDE", "NOITE"].includes(turno)) {
    return res.status(400).json({ error: "Turno inválido" });
  }

  const id = uuid();
  try {
    db.prepare(
      `insert into quadros (id, escola_id, turma_codigo, turno, disciplina_id, observacao)
       values (?, ?, ?, ?, ?, ?)`,
    ).run(id, escola_id, turma_codigo, turno, disciplina_id, observacao);
  } catch {
    return res
      .status(409)
      .json({
        error:
          "Já existe quadro para esta turma, turno e disciplina nesta escola",
      });
  }

  return res.status(201).json(
    db.prepare("select * from quadros where id = ?").get(id),
  );
});

apiRouter.put("/quadros/:id", (req, res) => {
  const turma_codigo = String(req.body?.turma_codigo ?? "").trim();
  const turno = String(req.body?.turno ?? "");
  const disciplina_id = req.body?.disciplina_id || null;
  const observacao = String(req.body?.observacao ?? "").trim() || null;

  if (!turma_codigo) {
    return res.status(400).json({ error: "Informe o código da turma" });
  }
  if (!["MANHA", "TARDE", "NOITE"].includes(turno)) {
    return res.status(400).json({ error: "Turno inválido" });
  }

  try {
    const result = db
      .prepare(
        `update quadros set turma_codigo = ?, turno = ?, disciplina_id = ?,
         observacao = ?, updated_at = datetime('now')
         where id = ?`,
      )
      .run(turma_codigo, turno, disciplina_id, observacao, req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Quadro não encontrado" });
    }
  } catch {
    return res
      .status(409)
      .json({
        error:
          "Já existe quadro para esta turma, turno e disciplina nesta escola",
      });
  }

  return res.json(db.prepare("select * from quadros where id = ?").get(req.params.id));
});

apiRouter.delete("/quadros/:id", (req, res) => {
  const result = db.prepare("delete from quadros where id = ?").run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Quadro não encontrado" });
  }
  return res.status(204).send();
});

apiRouter.get("/quadros/:id", (req, res) => {
  const quadro = db
    .prepare(
      `select q.*, e.nome as escola_nome,
              d.nome as disciplina_nome, d.codigo as disciplina_codigo
       from quadros q
       join escolas e on e.id = q.escola_id
       left join disciplinas d on d.id = q.disciplina_id
       where q.id = ?`,
    )
    .get(req.params.id) as
    | {
        id: string;
        escola_id: string;
        turno: string;
        disciplina_id: string | null;
      }
    | undefined;
  if (!quadro) return res.status(404).json({ error: "Quadro não encontrado" });

  const slotsStmt = db.prepare(
    `select s.*, p.nome as professor_nome
     from quadro_slots s
     left join professores p on p.matricula = s.matricula
     where s.quadro_id = ?
     order by s.dia, s.periodo`,
  );

  const slots = slotsStmt.all(req.params.id);

  // Mesmo turno + disciplina = grupo editável junto (várias turmas na grade)
  const irmaos = db
    .prepare(
      `select q.*, e.nome as escola_nome,
              d.nome as disciplina_nome, d.codigo as disciplina_codigo
       from quadros q
       join escolas e on e.id = q.escola_id
       left join disciplinas d on d.id = q.disciplina_id
       where q.escola_id = ? and q.turno = ?
         and (
           (? is null and q.disciplina_id is null)
           or q.disciplina_id = ?
         )
       order by q.turma_codigo collate nocase`,
    )
    .all(
      quadro.escola_id,
      quadro.turno,
      quadro.disciplina_id,
      quadro.disciplina_id,
    ) as Array<Record<string, unknown> & { id: string; turma_codigo: string }>;

  const grupo = irmaos.map((q) => ({
    quadro: q,
    slots: slotsStmt.all(q.id),
  }));

  res.json({ quadro, slots, grupo });
});

/** Cria vários quadros de uma vez (mesmo turno/disciplina, várias turmas). */
apiRouter.post("/escolas/:id/quadros/lote", (req, res) => {
  const escola_id = req.params.id;
  const escola = db.prepare("select id from escolas where id = ?").get(escola_id);
  if (!escola) return res.status(404).json({ error: "Escola não encontrada" });

  const turno = String(req.body?.turno ?? "");
  const disciplina_id = req.body?.disciplina_id || null;
  const observacao = String(req.body?.observacao ?? "").trim() || null;
  const turmasRaw = Array.isArray(req.body?.turmas) ? req.body.turmas : [];
  const turmas = [
    ...new Set(
      turmasRaw
        .map((t: unknown) => String(t ?? "").trim())
        .filter(Boolean),
    ),
  ];

  if (turmas.length === 0) {
    return res.status(400).json({ error: "Informe ao menos uma turma" });
  }
  if (!["MANHA", "TARDE", "NOITE"].includes(turno)) {
    return res.status(400).json({ error: "Turno inválido" });
  }

  const insert = db.prepare(
    `insert into quadros (id, escola_id, turma_codigo, turno, disciplina_id, observacao)
     values (?, ?, ?, ?, ?, ?)`,
  );

  const criados: unknown[] = [];
  const ignorados: string[] = [];
  const erros: string[] = [];

  try {
    db.exec("BEGIN");
    for (const turma_codigo of turmas) {
      const id = uuid();
      try {
        insert.run(
          id,
          escola_id,
          turma_codigo,
          turno,
          disciplina_id,
          observacao,
        );
        criados.push(
          db.prepare("select * from quadros where id = ?").get(id),
        );
      } catch {
        ignorados.push(turma_codigo);
        erros.push(
          `Turma ${turma_codigo}: já existe neste turno/disciplina`,
        );
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Erro ao criar quadros",
    });
  }

  if (criados.length === 0) {
    return res.status(409).json({
      error: erros[0] ?? "Nenhum quadro criado",
      ignorados,
      erros,
    });
  }

  return res.status(201).json({
    criados,
    ignorados,
    erros,
  });
});

/** Liga/desliga carência no horário (célula do quadro da turma). */
apiRouter.put("/quadros/:id/slots", (req, res) => {
  const quadro_id = req.params.id;
  const dia = Number(req.body?.dia);
  const periodo = Number(req.body?.periodo);
  const ativo = Boolean(req.body?.ativo);
  const tipo =
    String(req.body?.tipo ?? "REAL").toUpperCase() === "TEMPORARIA"
      ? "TEMPORARIA"
      : "REAL";
  let expira_em: string | null = null;

  if (!Number.isInteger(dia) || dia < 1 || dia > 5) {
    return res.status(400).json({ error: "Dia inválido" });
  }
  if (!Number.isInteger(periodo) || periodo < 1 || periodo > 6) {
    return res.status(400).json({ error: "Período inválido" });
  }

  if (ativo) {
    if (tipo === "TEMPORARIA") {
      expira_em = String(req.body?.expira_em ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expira_em)) {
        return res.status(400).json({
          error: "Carência temporária exige data de expiração (AAAA-MM-DD)",
        });
      }
    }
  }

  const quadro = db.prepare("select id from quadros where id = ?").get(quadro_id);
  if (!quadro) return res.status(404).json({ error: "Quadro não encontrado" });

  const existing = db
    .prepare(
      "select id from quadro_slots where quadro_id = ? and dia = ? and periodo = ?",
    )
    .get(quadro_id, dia, periodo) as { id: string } | undefined;

  if (!ativo) {
    if (existing) {
      db.prepare("delete from quadro_slots where id = ?").run(existing.id);
    }
    return res.json({ removed: true });
  }

  if (existing) {
    db.prepare(
      `update quadro_slots
       set tipo = ?, expira_em = ?, updated_at = datetime('now')
       where id = ?`,
    ).run(tipo, expira_em, existing.id);

    return res.json(
      db
        .prepare(
          `select s.*, p.nome as professor_nome
           from quadro_slots s
           left join professores p on p.matricula = s.matricula
           where s.id = ?`,
        )
        .get(existing.id),
    );
  }

  const id = uuid();
  db.prepare(
    `insert into quadro_slots (id, quadro_id, dia, periodo, tipo, expira_em)
     values (?, ?, ?, ?, ?, ?)`,
  ).run(id, quadro_id, dia, periodo, tipo, expira_em);

  return res.status(201).json(
    db
      .prepare(
        `select s.*, p.nome as professor_nome
         from quadro_slots s
         left join professores p on p.matricula = s.matricula
         where s.id = ?`,
      )
      .get(id),
  );
});

apiRouter.patch("/quadro-slots/:id/professor", (req, res) => {
  const matriculaRaw = req.body?.matricula;
  const matricula =
    matriculaRaw === null || matriculaRaw === undefined || matriculaRaw === ""
      ? null
      : String(matriculaRaw).trim();

  if (matricula) {
    const prof = db
      .prepare("select matricula from professores where matricula = ?")
      .get(matricula);
    if (!prof) {
      return res.status(400).json({ error: "Professor não encontrado" });
    }
  }

  const result = db
    .prepare(
      `update quadro_slots set matricula = ?, updated_at = datetime('now')
       where id = ?`,
    )
    .run(matricula, req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Slot não encontrado" });
  }

  return res.json(
    db
      .prepare(
        `select s.*, p.nome as professor_nome
         from quadro_slots s
         left join professores p on p.matricula = s.matricula
         where s.id = ?`,
      )
      .get(req.params.id),
  );
});

apiRouter.post("/quadros/:id/atribuir", (req, res) => {
  const quadro_id = req.params.id;
  const matricula = String(req.body?.matricula ?? "").trim();
  const ids = Array.isArray(req.body?.slot_ids)
    ? (req.body.slot_ids as unknown[]).map(String)
    : [];

  if (!matricula) {
    return res.status(400).json({ error: "Informe o professor" });
  }
  if (ids.length === 0) {
    return res.status(400).json({ error: "Selecione ao menos um horário" });
  }

  const prof = db
    .prepare("select matricula from professores where matricula = ?")
    .get(matricula);
  if (!prof) return res.status(400).json({ error: "Professor não encontrado" });

  const update = db.prepare(
    `update quadro_slots set matricula = ?, updated_at = datetime('now')
     where id = ? and quadro_id = ?`,
  );

  let updated = 0;
  for (const id of ids) {
    updated += Number(update.run(matricula, id, quadro_id).changes);
  }

  const slots = db
    .prepare(
      `select s.*, p.nome as professor_nome
       from quadro_slots s
       left join professores p on p.matricula = s.matricula
       where s.quadro_id = ?
       order by s.dia, s.periodo`,
    )
    .all(quadro_id);

  return res.json({ updated, slots });
});

apiRouter.put("/quadros/:id/observacao", (req, res) => {
  const texto = String(req.body?.observacao ?? "").trim() || null;
  const result = db
    .prepare(
      `update quadros set observacao = ?, updated_at = datetime('now') where id = ?`,
    )
    .run(texto, req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Quadro não encontrado" });
  }
  return res.json(db.prepare("select * from quadros where id = ?").get(req.params.id));
});

// Dashboard
apiRouter.get("/dashboard", (_req, res) => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const professores = (
    db.prepare("select count(*) as c from professores").get() as { c: number }
  ).c;
  const escolasCount = (
    db.prepare("select count(*) as c from escolas").get() as { c: number }
  ).c;
  const quadrosCount = (
    db.prepare("select count(*) as c from quadros").get() as { c: number }
  ).c;

  const heTotal = (
    db
      .prepare(
        `select coalesce(sum(tempos_autorizados), 0) as t
         from horas_extra
         where (inicio is null or inicio <= ?)
           and (termino is null or termino >= ?)`,
      )
      .get(today, today) as { t: number }
  ).t;

  const heExpirada = (
    db
      .prepare(
        `select count(*) as c
         from horas_extra
         where termino is not null and termino < ?`,
      )
      .get(today) as { c: number }
  ).c;

  const alocTempos = (
    db
      .prepare(
        `select coalesce(sum(tempos), 0) as t
         from alocacoes where status = 'ATIVA'`,
      )
      .get() as { t: number }
  ).t;

  const slotsCobertos = (
    db
      .prepare(
        `select count(*) as c from quadro_slots where matricula is not null`,
      )
      .get() as { c: number }
  ).c;

  const carenciaTotal = (
    db.prepare("select count(*) as c from quadro_slots").get() as { c: number }
  ).c;
  const carenciaAberta = (
    db
      .prepare(
        `select count(*) as c from quadro_slots where matricula is null`,
      )
      .get() as { c: number }
  ).c;

  const heAbertas = (
    db
      .prepare(
        `select count(*) as c from horas_extra
         where termino is null or termino >= ?`,
      )
      .get(today) as { c: number }
  ).c;

  const inconsistentes = db
    .prepare(
      `with he as (
         select matricula, sum(tempos_autorizados) as he
         from horas_extra
         where (inicio is null or inicio <= ?)
           and (termino is null or termino >= ?)
         group by matricula
       ),
       aloc as (
         select matricula, sum(tempos) as t
         from alocacoes
         where status = 'ATIVA'
         group by matricula
       ),
       slot as (
         select matricula, count(*) as t
         from quadro_slots
         where matricula is not null
         group by matricula
       )
       select p.matricula,
              p.nome,
              coalesce(he.he, 0) as heAutorizada,
              coalesce(aloc.t, 0) + coalesce(slot.t, 0) as temposAlocados,
              coalesce(he.he, 0) - (coalesce(aloc.t, 0) + coalesce(slot.t, 0)) as saldo
       from professores p
       left join he on he.matricula = p.matricula
       left join aloc on aloc.matricula = p.matricula
       left join slot on slot.matricula = p.matricula
       where (
         coalesce(he.he, 0) > 0
         or coalesce(aloc.t, 0) > 0
         or coalesce(slot.t, 0) > 0
       )
       and (
         coalesce(he.he, 0) - (coalesce(aloc.t, 0) + coalesce(slot.t, 0)) < 0
         or (coalesce(he.he, 0) > 0 and coalesce(aloc.t, 0) + coalesce(slot.t, 0) = 0)
       )
       order by saldo asc, p.nome collate nocase`,
    )
    .all(today, today);

  res.json({
    professores,
    escolas: escolasCount,
    quadros: quadrosCount,
    heTotal,
    heExpirada,
    alocTotal: alocTempos + slotsCobertos,
    heAbertas,
    carenciaTotal,
    carenciaAberta,
    inconsistentes,
  });
});
