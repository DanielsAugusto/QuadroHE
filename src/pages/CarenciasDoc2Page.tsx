import { Link } from "react-router-dom";
import { EmptyState, PageHeader, Panel, btnSecondary } from "@/components/ui";

export function CarenciasDoc2Page() {
  return (
    <div>
      <PageHeader
        title="Carências - DOC II"
        description="Professor Docente II - Anos Finais"
        actions={
          <Link to="/carencias" className={btnSecondary}>
            Voltar
          </Link>
        }
      />

      <Panel>
        <EmptyState message="Em breve: funcionalidades para carências de DOC II." />
      </Panel>
    </div>
  );
}
