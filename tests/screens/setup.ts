import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

const ADMIN = {
  id: "admin-1",
  email: "admin@test.local",
  nome: "Admin Teste",
  papel: "admin" as const,
};

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  login: vi.fn(),
  confirmMfa: vi.fn(),
  logout: vi.fn(),
  auth: {
    user: {
      id: "admin-1",
      email: "admin@test.local",
      nome: "Admin Teste",
      papel: "admin" as const,
    } as {
      id: string;
      email: string;
      nome: string;
      papel: "admin" | "operador";
    } | null,
    loading: false,
    isAdmin: true,
  },
}));

vi.mock("@/lib/api", () => ({
  api: mocks.api,
  getToken: () => "test-token",
  setToken: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: mocks.auth.user,
    loading: mocks.auth.loading,
    isAdmin: mocks.auth.isAdmin,
    login: mocks.login,
    confirmMfa: mocks.confirmMfa,
    logout: mocks.logout,
  }),
}));

(globalThis as { __qhScreenMocks?: typeof mocks }).__qhScreenMocks = mocks;

declare global {
  // eslint-disable-next-line no-var
  var __qhScreenMocks: typeof mocks;
}

afterEach(() => {
  cleanup();
  mocks.api.mockReset();
  mocks.login.mockReset();
  mocks.confirmMfa.mockReset();
  mocks.logout.mockReset();
  mocks.auth.user = ADMIN;
  mocks.auth.loading = false;
  mocks.auth.isAdmin = true;
});
