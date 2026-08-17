import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { ConfigHoraExtraPage } from "@/pages/ConfigHoraExtraPage";
import { ConfigLicencasPage } from "@/pages/ConfigLicencasPage";
import { ConfigLogsPage } from "@/pages/ConfigLogsPage";
import { ConfigUsuariosPage } from "@/pages/ConfigUsuariosPage";
import { DisciplinasPage } from "@/pages/DisciplinasPage";
import { EscolasPage } from "@/pages/EscolasPage";
import { ProfessoresPage } from "@/pages/ProfessoresPage";

type Tab =
  | "professores"
  | "escolas"
  | "disciplinas"
  | "hora-extra"
  | "licencas"
  | "usuarios"
  | "logs";

const baseTabs: Array<{ id: Tab; label: string }> = [
  { id: "professores", label: "Professores" },
  { id: "escolas", label: "Escolas" },
  { id: "disciplinas", label: "Disciplinas" },
  { id: "hora-extra", label: "Hora Extra" },
  { id: "licencas", label: "Licenças" },
];

const adminTabs: Array<{ id: Tab; label: string }> = [
  { id: "usuarios", label: "Usuários" },
  { id: "logs", label: "Logs" },
];

export function resolveTab(tabParam: string | null, isAdmin: boolean): Tab {
  if (isAdmin && (tabParam === "usuarios" || tabParam === "logs")) {
    return tabParam;
  }
  if (
    tabParam === "escolas" ||
    tabParam === "disciplinas" ||
    tabParam === "hora-extra" ||
    tabParam === "licencas"
  ) {
    return tabParam;
  }
  return "professores";
}

export function ConfiguracaoPage() {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const active = resolveTab(params.get("tab"), isAdmin);
  const tabs = isAdmin ? [...baseTabs, ...adminTabs] : baseTabs;

  useEffect(() => {
    const tab = params.get("tab");
    if ((tab === "usuarios" || tab === "logs") && !isAdmin) {
      setParams({}, { replace: true });
    }
  }, [isAdmin, params, setParams]);

  function setTab(next: Tab) {
    setParams(
      next === "professores" ? {} : { tab: next },
      { replace: true },
    );
  }

  return (
    <div>
      <PageHeader
        title="Configuração"
        description="Cadastros, hora extra, licenças e histórico de ações do sistema."
      />

      <div className="mb-5 flex flex-wrap gap-2 border-b border-border pb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              active === t.id
                ? "bg-brand text-white"
                : "border border-border bg-white text-foreground hover:bg-brand-soft/40"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === "professores" ? (
        <ProfessoresPage embedded />
      ) : active === "escolas" ? (
        <EscolasPage embedded />
      ) : active === "disciplinas" ? (
        <DisciplinasPage embedded />
      ) : active === "hora-extra" ? (
        <ConfigHoraExtraPage />
      ) : active === "licencas" ? (
        <ConfigLicencasPage />
      ) : active === "usuarios" ? (
        <ConfigUsuariosPage />
      ) : active === "logs" ? (
        <ConfigLogsPage />
      ) : (
        <ProfessoresPage embedded />
      )}
    </div>
  );
}
