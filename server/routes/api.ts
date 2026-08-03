import { Router, type Request } from "express";
import { v4 as uuid } from "uuid";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

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
          `select * from professores${where} order by nome collate nocase`,
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
      `select * from professores${where}
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

  const upsert = db.prepare(
    `insert into professores (matricula, nome, cargo, funcao)
     values (?, ?, ?, ?)
     on conflict(matricula) do update set
       nome = excluded.nome,
       cargo = excluded.cargo,
       funcao = excluded.funcao,
       updated_at = datetime('now')`,
  );
  const find = db.prepare(
    "select matricula from professores where matricula = ?",
  );

  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;
  const erros: string[] = [];

  try {
    db.exec("BEGIN");
    for (let i = 0; i < itens.length; i++) {
      const row = itens[i] ?? {};
      const matricula = String(row.matricula ?? "").trim();
      const nome = String(row.nome ?? "").trim();
      const cargo = String(row.cargo ?? "").trim() || null;
      const funcao = String(row.funcao ?? "").trim() || null;

      if (!matricula || !nome) {
        ignorados += 1;
        erros.push(`Linha ${i + 1}: matrícula e nome são obrigatórios`);
        continue;
      }

      const exists = find.get(matricula);
      upsert.run(matricula, nome, cargo, funcao);
      if (exists) atualizados += 1;
      else criados += 1;
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

  return res.json({ criados, atualizados, ignorados, erros });
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

apiRouter.delete("/professores/:matricula", (req, res) => {
  const result = db
    .prepare("delete from professores where matricula = ?")
    .run(req.params.matricula);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Não encontrado" });
  }
  return res.status(204).send();
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
    .all();
  res.json(rows);
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
    `select dia, periodo, matricula from quadro_slots where quadro_id = ?`,
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
      .json({ error: "Já existe quadro para esta turma neste turno" });
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
      .json({ error: "Já existe quadro para esta turma neste turno" });
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
    .get(req.params.id);
  if (!quadro) return res.status(404).json({ error: "Quadro não encontrado" });

  const slots = db
    .prepare(
      `select s.*, p.nome as professor_nome
       from quadro_slots s
       left join professores p on p.matricula = s.matricula
       where s.quadro_id = ?
       order by s.dia, s.periodo`,
    )
    .all(req.params.id);

  res.json({ quadro, slots });
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
