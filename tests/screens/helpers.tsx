import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

export const ADMIN = {
  id: "admin-1",
  email: "admin@test.local",
  nome: "Admin Teste",
  papel: "admin" as const,
};

export const OPERADOR = {
  id: "op-1",
  email: "operador@test.local",
  nome: "Operador Teste",
  papel: "operador" as const,
};

type ScreenMocks = NonNullable<
  (typeof globalThis)["__qhScreenMocks"]
>;

export const screenMocks = (globalThis as { __qhScreenMocks: ScreenMocks })
  .__qhScreenMocks;

export function asAdmin() {
  screenMocks.auth.user = ADMIN;
  screenMocks.auth.isAdmin = true;
  screenMocks.auth.loading = false;
}

export function asOperador() {
  screenMocks.auth.user = OPERADOR;
  screenMocks.auth.isAdmin = false;
  screenMocks.auth.loading = false;
}

export function asGuest() {
  screenMocks.auth.user = null;
  screenMocks.auth.isAdmin = false;
  screenMocks.auth.loading = false;
}

/** Responde GET/POST conforme o path (sem query string), chave mais longa primeiro. */
export function stubApi(
  routes: Record<
    string,
    | unknown
    | ((path: string, options?: RequestInit) => unknown | Promise<unknown>)
  >,
) {
  screenMocks.api.mockImplementation(
    async (path: string, options?: RequestInit) => {
      const clean = path.split("?")[0];
      const keys = Object.keys(routes).sort((a, b) => b.length - a.length);
      for (const key of keys) {
        if (clean === key || clean.startsWith(`${key}/`) || path.startsWith(key)) {
          const value = routes[key];
          if (typeof value === "function") return value(path, options);
          return value;
        }
      }
      throw new Error(`API não mockada: ${path}`);
    },
  );
}

export const emptyPage = {
  items: [] as unknown[],
  total: 0,
  page: 1,
  pageSize: 20,
};

export function renderPage(
  ui: ReactElement,
  {
    route = "/",
    path = "*",
  }: {
    route?: string;
    path?: string;
  } = {},
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}
