import { v4 as uuid } from "uuid";
import type { Request } from "express";
import { db } from "./db.js";

export type AuditCategoria =
  | "hora_extra"
  | "carencia"
  | "professores"
  | "escolas"
  | "disciplinas"
  | "alocacoes"
  | "quadros"
  | "sistema";

export type AuditAcao =
  | "criar"
  | "editar"
  | "excluir"
  | "importar"
  | "inativar"
  | "reativar"
  | "atribuir"
  | "remover"
  | "licenca_abrir"
  | "licenca_encerrar"
  | "login"
  | "login_falha"
  | "logout"
  | "authz_negada"
  | "alerta"
  | "mfa"
  | "outro";

export function writeAuditLog(input: {
  req?: Request;
  categoria: AuditCategoria;
  acao: AuditAcao;
  entidade?: string | null;
  entidade_id?: string | null;
  resumo: string;
  detalhes?: unknown;
}) {
  try {
    const user = input.req?.user;
    const requestId = input.req?.requestId ?? null;
    const detalhes =
      input.detalhes != null
        ? { ...(typeof input.detalhes === "object" && input.detalhes
            ? (input.detalhes as Record<string, unknown>)
            : { valor: input.detalhes }), request_id: requestId }
        : requestId
          ? { request_id: requestId }
          : null;
    db.prepare(
      `insert into audit_logs (
         id, user_id, user_email, user_nome,
         categoria, acao, entidade, entidade_id, resumo, detalhes, request_id
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      uuid(),
      user?.id ?? null,
      user?.email ?? null,
      user?.nome ?? null,
      input.categoria,
      input.acao,
      input.entidade ?? null,
      input.entidade_id ?? null,
      input.resumo,
      detalhes != null ? JSON.stringify(detalhes) : null,
      requestId,
    );
  } catch (err) {
    if (process.env.NODE_ENV !== "test") {
      console.error("Falha ao gravar audit_log:", err);
    }
  }
}
