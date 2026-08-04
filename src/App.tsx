import { Navigate, Route, Routes } from "react-router-dom";
import { AppNav } from "@/components/AppNav";
import { useAuth } from "@/lib/auth";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { FichaProfessorPage } from "@/pages/FichaProfessorPage";
import { ConfiguracaoPage } from "@/pages/ConfiguracaoPage";
import { HoraExtraPage } from "@/pages/HoraExtraPage";
import { AlocacoesPage } from "@/pages/AlocacoesPage";
import { CarenciasPage } from "@/pages/CarenciasPage";
import { ContagensPage } from "@/pages/ContagensPage";
import { EscolaQuadrosPage } from "@/pages/EscolaQuadrosPage";
import { EscolasLotacaoPage } from "@/pages/EscolasLotacaoPage";
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
      <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">{children}</main>
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
        element={<Navigate to="/configuracao?tab=professores" replace />}
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
        path="/configuracao"
        element={
          <Protected>
            <ConfiguracaoPage />
          </Protected>
        }
      />
      <Route
        path="/escolas"
        element={
          <Protected>
            <EscolasLotacaoPage />
          </Protected>
        }
      />
      <Route
        path="/disciplinas"
        element={<Navigate to="/configuracao?tab=disciplinas" replace />}
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
        path="/contagens"
        element={
          <Protected>
            <ContagensPage />
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
