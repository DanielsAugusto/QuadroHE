import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  IconDeleteButton,
  Modal,
  PageHeader,
  Panel,
  btnPrimary,
  btnSecondary,
  inputClass,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { parseCarenciasPlanilha } from "@/lib/importCarenciasPlanilha";
import type { Escola } from "@/lib/types";

type Resumo = Escola & {
  quadros?: number;
  abertos?: number;
  por_disciplina?: Array<{ codigo: string; nome: string; abertos: number }>;
};
type ModoAdd = "existente" | "nova";

type ImportResult = {
  escolas_criadas: number;
  escolas_ativadas: number;
  quadros_criados: number;
  slots_criados: number;
  slots_existentes: number;
  ignorados: number;
  erros: string[];
};

type ProfessorAlocado = {
  matricula: string;
  nome: string;
  cargo: string | null;
  funcao: string | null;
  escolas: Array<{ escola_id: string; escola_nome: string; quadro_ids: string[] }>;
};

export function CarenciasPage() {
  const { isAdmin } = useAuth();
  const location = useLocation();
  const [escolas, setEscolas] = useState<Resumo[]>([]);
  const [disponiveis, setDisponiveis] = useState<Escola[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modo, setModo] = useState<ModoAdd>("existente");
  const [escolaId, setEscolaId] = useState("");
  const [nome, setNome] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<Resumo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [buscaEscola, setBuscaEscola] = useState("");
  const [openEscolaSelect, setOpenEscolaSelect] = useState(false);
  const escolaSelectRef = useRef<HTMLDivElement>(null);

  const [professoresAlocados, setProfessoresAlocados] = useState<ProfessorAlocado[]>([]);
  const [professorFiltro, setProfessorFiltro] = useState<string>("");
  const [buscaProfessor, setBuscaProfessor] = useState("");
  const [openProfSelect, setOpenProfSelect] = useState(false);
  const profSelectRef = useRef<HTMLDivElement>(null);

  const [escolaListaFiltro, setEscolaListaFiltro] = useState("");
  const [buscaEscolaLista, setBuscaEscolaLista] = useState("");
  const [openEscolaLista, setOpenEscolaLista] = useState(false);
  const escolaListaRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [lista, profs] = await Promise.all([
        api<Resumo[]>("/carencias/escolas-resumo"),
        api<ProfessorAlocado[]>("/carencias/professores-alocados"),
      ]);
      setEscolas(lista);
      setProfessoresAlocados(profs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        escolaSelectRef.current &&
        !escolaSelectRef.current.contains(e.target as Node)
      ) {
        setOpenEscolaSelect(false);
      }
      if (
        profSelectRef.current &&
        !profSelectRef.current.contains(e.target as Node)
      ) {
        setOpenProfSelect(false);
      }
      if (
        escolaListaRef.current &&
        !escolaListaRef.current.contains(e.target as Node)
      ) {
        setOpenEscolaLista(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const escolasFiltradas = disponiveis.filter((e) =>
    e.nome.toLowerCase().includes(buscaEscola.toLowerCase())
  );

  const escolaSelecionada = disponiveis.find((e) => e.id === escolaId);

  const professorSelecionado = professoresAlocados.find((p) => p.matricula === professorFiltro);
  const professoresFiltrados = professoresAlocados.filter(
    (p) =>
      p.nome.toLowerCase().includes(buscaProfessor.toLowerCase()) ||
      p.matricula.includes(buscaProfessor)
  );

  const escolasListaOpcoes = escolas.filter((e) =>
    e.nome.toLowerCase().includes(buscaEscolaLista.toLowerCase()),
  );
  const escolaListaSelecionada = escolas.find((e) => e.id === escolaListaFiltro);

  const escolasExibidas = escolas.filter((e) => {
    if (escolaListaFiltro && e.id !== escolaListaFiltro) return false;
    if (
      professorFiltro &&
      !professorSelecionado?.escolas.some((pe) => pe.escola_id === e.id)
    ) {
      return false;
    }
    return true;
  });

  const quadrosFiltro = professorSelecionado?.escolas.reduce((acc, e) => {
    acc[e.escola_id] = e.quadro_ids;
    return acc;
  }, {} as Record<string, string[]>);

  function escolherEscola(e: Escola) {
    setEscolaId(e.id);
    setBuscaEscola("");
    setOpenEscolaSelect(false);
  }

  async function abrirModal() {
    setNome("");
    setEscolaId("");
    setBuscaEscola("");
    setOpenEscolaSelect(false);
    setFormError(null);
    try {
      const semCarencia = await api<Escola[]>("/carencias/escolas-disponiveis");
      setDisponiveis(semCarencia);
      setModo(semCarencia.length > 0 ? "existente" : "nova");
    } catch {
      setDisponiveis([]);
      setModo("nova");
    }
    setModalOpen(true);
  }

  function fecharModal() {
    setModalOpen(false);
    setNome("");
    setEscolaId("");
    setBuscaEscola("");
    setOpenEscolaSelect(false);
    setFormError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFormError(null);
    try {
      if (modo === "existente") {
        if (!escolaId) {
          throw new Error("Selecione uma escola.");
        }
        await api(`/escolas/${escolaId}/carencias`, {
          method: "PATCH",
          body: JSON.stringify({ ativa: true }),
        });
      } else {
        await api("/escolas", {
          method: "POST",
          body: JSON.stringify({ nome: nome.trim(), em_carencias: true }),
        });
      }
      fecharModal();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  async function confirmarRemocao() {
    if (!pendingRemove) return;
    setDeleting(true);
    try {
      await api(`/escolas/${pendingRemove.id}/carencias`, {
        method: "PATCH",
        body: JSON.stringify({ ativa: false }),
      });
      setPendingRemove(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover");
      setPendingRemove(null);
    } finally {
      setDeleting(false);
    }
  }

  async function onImportFile(file: File | null) {
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const itens = parseCarenciasPlanilha(buffer);
      const result = await api<ImportResult>("/carencias/import", {
        method: "POST",
        body: JSON.stringify({ itens }),
      });
      setImportResult(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar Excel");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="mb-3">
        <Link to="/carencias" className={btnSecondary}>
          ← Voltar
        </Link>
      </div>
      <PageHeader
        title="Carências - DOC I"
        description="Professor Docente I - Anos Iniciais. Inclua escolas uma a uma ou importe a planilha de carências (grade por escola/turno)."
        actions={
          <>
            {isAdmin ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) =>
                    void onImportFile(e.target.files?.[0] ?? null)
                  }
                />
                <button
                  type="button"
                  className={`${btnSecondary} w-full sm:w-auto`}
                  disabled={importing}
                  onClick={() => fileRef.current?.click()}
                >
                  {importing ? "Importando..." : "Importar Excel"}
                </button>
              </>
            ) : null}
            <button
              type="button"
              className={`${btnPrimary} w-full sm:w-auto`}
              onClick={() => void abrirModal()}
            >
              Adicionar escola
            </button>
          </>
        }
      />
      <ErrorBanner message={error} />

      <div className="mb-6 space-y-3">
        <Panel className="flex flex-wrap items-end gap-4">
          <div className="min-w-[260px] flex-1">
            <label className="mb-1.5 block text-sm font-medium text-muted">
              Buscar escola
            </label>
            <div className="relative" ref={escolaListaRef}>
              <input
                className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/30"
                role="combobox"
                aria-expanded={openEscolaLista}
                placeholder={
                  escolaListaSelecionada
                    ? escolaListaSelecionada.nome
                    : "Digite o nome da escola…"
                }
                value={openEscolaLista || buscaEscolaLista ? buscaEscolaLista : ""}
                onFocus={() => setOpenEscolaLista(true)}
                onChange={(e) => {
                  setBuscaEscolaLista(e.target.value);
                  setOpenEscolaLista(true);
                  if (escolaListaFiltro) setEscolaListaFiltro("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setOpenEscolaLista(false);
                    setBuscaEscolaLista("");
                  }
                  if (e.key === "Enter" && escolasListaOpcoes[0]) {
                    e.preventDefault();
                    setEscolaListaFiltro(escolasListaOpcoes[0].id);
                    setBuscaEscolaLista("");
                    setOpenEscolaLista(false);
                  }
                  if (e.key === "Backspace" && !buscaEscolaLista && escolaListaFiltro) {
                    setEscolaListaFiltro("");
                  }
                }}
              />
              {openEscolaLista && (
                <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
                  {escolasListaOpcoes.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-muted">
                      Nenhuma escola encontrada.
                    </li>
                  ) : (
                    escolasListaOpcoes.slice(0, 80).map((e) => {
                      const active = e.id === escolaListaFiltro;
                      return (
                        <li key={e.id} role="option" aria-selected={active}>
                          <button
                            type="button"
                            className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm transition ${
                              active ? "bg-brand-soft/50" : "hover:bg-brand-soft/25"
                            }`}
                            onMouseDown={(ev) => ev.preventDefault()}
                            onClick={() => {
                              setEscolaListaFiltro(e.id);
                              setBuscaEscolaLista("");
                              setOpenEscolaLista(false);
                            }}
                          >
                            <span className="font-medium">{e.nome}</span>
                            <span className="text-xs text-muted">
                              {e.quadros ?? 0} quadro(s) · {e.abertos ?? 0} em aberto
                            </span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </div>
          </div>

          {professoresAlocados.length > 0 && (
            <div className="min-w-[260px] flex-1">
              <label className="mb-1.5 block text-sm font-medium text-muted">
                Filtrar por professor
              </label>
              <div className="relative" ref={profSelectRef}>
                <input
                  className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/30"
                  role="combobox"
                  aria-expanded={openProfSelect}
                  placeholder={
                    professorSelecionado
                      ? `${professorSelecionado.nome} (${professorSelecionado.matricula})`
                      : "Buscar professor…"
                  }
                  value={openProfSelect || buscaProfessor ? buscaProfessor : ""}
                  onFocus={() => setOpenProfSelect(true)}
                  onChange={(e) => {
                    setBuscaProfessor(e.target.value);
                    setOpenProfSelect(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setOpenProfSelect(false);
                      setBuscaProfessor("");
                    }
                    if (e.key === "Enter" && professoresFiltrados[0]) {
                      e.preventDefault();
                      setProfessorFiltro(professoresFiltrados[0].matricula);
                      setBuscaProfessor("");
                      setOpenProfSelect(false);
                    }
                    if (e.key === "Backspace" && !buscaProfessor && professorFiltro) {
                      setProfessorFiltro("");
                    }
                  }}
                />
                {openProfSelect && (
                  <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
                    {professoresFiltrados.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-muted">
                        Nenhum professor encontrado.
                      </li>
                    ) : (
                      professoresFiltrados.slice(0, 50).map((p) => {
                        const active = p.matricula === professorFiltro;
                        return (
                          <li key={p.matricula} role="option" aria-selected={active}>
                            <button
                              type="button"
                              className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm transition ${
                                active ? "bg-brand-soft/50" : "hover:bg-brand-soft/25"
                              }`}
                              onMouseDown={(ev) => ev.preventDefault()}
                              onClick={() => {
                                setProfessorFiltro(p.matricula);
                                setBuscaProfessor("");
                                setOpenProfSelect(false);
                              }}
                            >
                              <span className="font-medium">{p.nome}</span>
                              <span className="text-xs text-muted">
                                {p.matricula}
                                {p.cargo ? ` · ${p.cargo}` : ""}
                                {" · "}
                                {p.escolas.length} escola(s)
                              </span>
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                )}
              </div>
            </div>
          )}

          {(escolaListaFiltro || professorFiltro) && (
            <button
              type="button"
              className="h-9 rounded-md bg-brand-soft px-3 text-xs font-medium text-brand transition hover:bg-brand hover:text-white"
              onClick={() => {
                setEscolaListaFiltro("");
                setBuscaEscolaLista("");
                setProfessorFiltro("");
                setBuscaProfessor("");
              }}
            >
              Limpar filtros
            </button>
          )}
        </Panel>

        <div className="flex flex-wrap gap-2">
          <Link to="/carencias/doc1/painel" className={btnSecondary}>
            Painel de controle
          </Link>
          <Link to="/carencias/doc1/disciplinas" className={btnSecondary}>
            Por disciplina
          </Link>
        </div>
      </div>

      {escolasExibidas.length === 0 ? (
        <EmptyState
          message={
            escolaListaFiltro || professorFiltro
              ? "Nenhuma escola encontrada com os filtros atuais."
              : "Nenhuma escola na lista de carências. Adicione uma para começar."
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {escolasExibidas.map((e) => {
            const quadrosProf = quadrosFiltro?.[e.id];
            const linkTo = professorFiltro && quadrosProf
              ? `/carencias/doc1/${e.id}?prof=${professorFiltro}&quadros=${quadrosProf.join(",")}`
              : `/carencias/doc1/${e.id}`;
            return (
              <Panel key={e.id} className="flex flex-col gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold text-brand-dark">
                    {e.nome}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {e.quadros ?? 0} quadro(s) · {e.abertos ?? 0} tempo(s) em aberto
                  </p>
                  {professorFiltro && quadrosProf && (
                    <p className="mt-1 text-xs text-brand">
                      {professorSelecionado?.nome.split(" ")[0]} em {quadrosProf.length} quadro(s)
                    </p>
                  )}
                  {(e.por_disciplina?.length ?? 0) > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {e.por_disciplina!.map((d) => (
                        <li
                          key={`${d.codigo}-${d.nome}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/70 px-2 py-1 text-xs"
                          title={d.nome}
                        >
                          <span className="font-semibold text-brand">
                            {d.codigo !== "—" ? d.codigo : d.nome}
                          </span>
                          <span className="tabular-nums text-muted">
                            {d.abertos} tempo{d.abertos === 1 ? "" : "s"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <Link
                    to={linkTo}
                    state={{ from: `${location.pathname}${location.search}` }}
                    className={btnPrimary}
                  >
                    Ver turmas / quadros
                  </Link>
                  {isAdmin ? (
                    <IconDeleteButton
                      title="Remover"
                      label={`Remover ${e.nome} das carências`}
                      onClick={() => setPendingRemove(e)}
                    />
                  ) : null}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        title="Adicionar escola às carências"
        onClose={fecharModal}
        wide
        tall
      >
        <ErrorBanner message={formError} />
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="inline-flex rounded-lg bg-background p-0.5 ring-1 ring-border">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                modo === "existente"
                  ? "bg-brand text-white"
                  : "text-muted hover:text-foreground"
              }`}
              onClick={() => setModo("existente")}
              disabled={disponiveis.length === 0}
            >
              Do cadastro
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                modo === "nova"
                  ? "bg-brand text-white"
                  : "text-muted hover:text-foreground"
              }`}
              onClick={() => setModo("nova")}
            >
              Criar nova
            </button>
          </div>

          {modo === "existente" ? (
            <Field label="Escola">
              <div className="relative" ref={escolaSelectRef}>
                <input
                  className={inputClass}
                  role="combobox"
                  aria-expanded={openEscolaSelect}
                  aria-autocomplete="list"
                  autoFocus
                  placeholder={
                    escolaSelecionada
                      ? escolaSelecionada.nome
                      : "Buscar escola…"
                  }
                  value={openEscolaSelect || buscaEscola ? buscaEscola : ""}
                  onFocus={() => setOpenEscolaSelect(true)}
                  onChange={(e) => {
                    setBuscaEscola(e.target.value);
                    setOpenEscolaSelect(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setOpenEscolaSelect(false);
                      setBuscaEscola("");
                    }
                    if (e.key === "Enter" && escolasFiltradas[0]) {
                      e.preventDefault();
                      escolherEscola(escolasFiltradas[0]);
                    }
                    if (
                      e.key === "Backspace" &&
                      !buscaEscola &&
                      escolaId
                    ) {
                      setEscolaId("");
                    }
                  }}
                />
                {openEscolaSelect && (
                  <ul
                    role="listbox"
                    className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-lg"
                  >
                    {escolasFiltradas.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-muted">
                        Nenhuma escola encontrada.
                      </li>
                    ) : (
                      escolasFiltradas.slice(0, 80).map((e) => {
                        const active = e.id === escolaId;
                        return (
                          <li key={e.id} role="option" aria-selected={active}>
                            <button
                              type="button"
                              className={`flex w-full px-3 py-2 text-left text-sm transition ${
                                active
                                  ? "bg-brand-soft/50"
                                  : "hover:bg-brand-soft/25"
                              }`}
                              onMouseDown={(ev) => ev.preventDefault()}
                              onClick={() => escolherEscola(e)}
                            >
                              {e.nome}
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                )}
              </div>
              <input type="hidden" name="escola_id" value={escolaId} />
            </Field>
          ) : (
            <Field label="Nome">
              <input
                className={inputClass}
                required
                autoFocus
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </Field>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className={btnSecondary}
              onClick={fecharModal}
              disabled={loading}
            >
              Cancelar
            </button>
            <button className={btnPrimary} disabled={loading}>
              {loading ? "Salvando..." : "Adicionar"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!pendingRemove}
        title="Remover da carência"
        message={
          pendingRemove
            ? `Remover "${pendingRemove.nome}" das carências? Todos os quadros e horários dessa escola serão apagados. A escola continua no cadastro.`
            : ""
        }
        confirmLabel="Remover"
        loading={deleting}
        onConfirm={() => void confirmarRemocao()}
        onClose={() => {
          if (!deleting) setPendingRemove(null);
        }}
      />

      <Modal
        open={!!importResult}
        title="Importação de carências"
        onClose={() => setImportResult(null)}
      >
        {importResult ? (
          <div className="space-y-3 text-sm">
            <ul className="space-y-1 text-muted">
              <li>
                <span className="font-medium text-ok">
                  {importResult.escolas_criadas}
                </span>{" "}
                escola(s) criada(s)
              </li>
              <li>
                <span className="font-medium text-foreground">
                  {importResult.escolas_ativadas}
                </span>{" "}
                escola(s) ativada(s) em carências
              </li>
              <li>
                <span className="font-medium text-ok">
                  {importResult.quadros_criados}
                </span>{" "}
                quadro(s) criado(s)
              </li>
              <li>
                <span className="font-medium text-ok">
                  {importResult.slots_criados}
                </span>{" "}
                tempo(s) aberto(s)
              </li>
              <li>
                <span className="font-medium text-foreground">
                  {importResult.slots_existentes}
                </span>{" "}
                tempo(s) já existentes (mantidos)
              </li>
              {importResult.ignorados > 0 ? (
                <li>
                  <span className="font-medium text-foreground">
                    {importResult.ignorados}
                  </span>{" "}
                  linha(s) ignorada(s)
                </li>
              ) : null}
            </ul>
            {importResult.erros.length > 0 ? (
              <div className="max-h-40 overflow-auto rounded-md border border-border bg-background p-2 text-xs text-muted">
                {importResult.erros.slice(0, 20).map((e) => (
                  <p key={e}>{e}</p>
                ))}
                {importResult.erros.length > 20 ? (
                  <p>… e mais {importResult.erros.length - 20}</p>
                ) : null}
              </div>
            ) : null}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                className={btnPrimary}
                onClick={() => setImportResult(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
