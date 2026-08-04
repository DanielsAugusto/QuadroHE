import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/ui";
import { DisciplinasPage } from "@/pages/DisciplinasPage";
import { EscolasPage } from "@/pages/EscolasPage";
import { ProfessoresPage } from "@/pages/ProfessoresPage";

type Tab = "professores" | "escolas" | "disciplinas";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "professores", label: "Professores" },
  { id: "escolas", label: "Escolas" },
  { id: "disciplinas", label: "Disciplinas" },
];

function resolveTab(tabParam: string | null): Tab {
  if (tabParam === "escolas" || tabParam === "disciplinas") return tabParam;
  return "professores";
}

export function ConfiguracaoPage() {
  const [params, setParams] = useSearchParams();
  const active = resolveTab(params.get("tab"));

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
        description="Cadastros de professores, escolas e disciplinas usados no sistema."
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
      ) : (
        <DisciplinasPage embedded />
      )}
    </div>
  );
}
