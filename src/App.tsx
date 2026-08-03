import { Navigate, Route, Routes } from "react-router-dom";
import { AppNav } from "@/components/AppNav";
import { useAuth } from "@/lib/auth";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ProfessoresPage } from "@/pages/ProfessoresPage";
import { FichaProfessorPage } from "@/pages/FichaProfessorPage";
import { EscolasPage } from "@/pages/EscolasPage";
import { DisciplinasPage } from "@/pages/DisciplinasPage";
import { HoraExtraPage } from "@/pages/HoraExtraPage";
import { AlocacoesPage } from "@/pages/AlocacoesPage";
import { CarenciasPage } from "@/pages/CarenciasPage";
import { EscolaQuadrosPage } from "@/pages/EscolaQuadrosPage";
import { QuadroTurmaPage } from "@/pages/QuadroTurmaPage";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Carregando...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="min-h-screen lg:flex">
      <AppNav />
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <DashboardPage />
          </Protected>
        }
      />
      <Route
        path="/professores"
        element={
          <Protected>
            <ProfessoresPage />
          </Protected>
        }
      />
      <Route
        path="/professores/:matricula"
        element={
          <Protected>
            <FichaProfessorPage />
          </Protected>
        }
      />
      <Route
        path="/escolas"
        element={
          <Protected>
            <EscolasPage />
          </Protected>
        }
      />
      <Route
        path="/disciplinas"
        element={
          <Protected>
            <DisciplinasPage />
          </Protected>
        }
      />
      <Route
        path="/hora-extra"
        element={
          <Protected>
            <HoraExtraPage />
          </Protected>
        }
      />
      <Route
        path="/alocacoes"
        element={
          <Protected>
            <AlocacoesPage />
          </Protected>
        }
      />
      <Route
        path="/carencias"
        element={
          <Protected>
            <CarenciasPage />
          </Protected>
        }
      />
      <Route
        path="/carencias/:escolaId"
        element={
          <Protected>
            <EscolaQuadrosPage />
          </Protected>
        }
      />
      <Route
        path="/carencias/:escolaId/:quadroId"
        element={
          <Protected>
            <QuadroTurmaPage />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
