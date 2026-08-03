import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/lib/auth";

const links = [
  { href: "/", label: "Dashboard", end: true },
  { href: "/professores", label: "Professores" },
  { href: "/escolas", label: "Escolas" },
  { href: "/disciplinas", label: "Disciplinas" },
  { href: "/hora-extra", label: "Hora Extra" },
  { href: "/carencias", label: "Carências" },
  { href: "/alocacoes", label: "Alocações" },
];

const STORAGE_KEY = "quadrohe_sidebar_collapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function AppNav() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
    document.documentElement.style.setProperty(
      "--app-sidebar",
      collapsed ? "3.5rem" : "16rem",
    );
  }, [collapsed]);

  return (
    <aside
      className={`relative flex w-full flex-col border-b border-border bg-brand text-white transition-[width] duration-200 lg:min-h-screen lg:border-b-0 lg:border-r lg:border-brand-dark ${
        collapsed ? "lg:w-14" : "lg:w-64"
      }`}
    >
      <button
        type="button"
        aria-label={collapsed ? "Abrir menu" : "Fechar menu"}
        title={collapsed ? "Abrir menu" : "Fechar menu"}
        onClick={() => setCollapsed((v) => !v)}
        className="absolute right-0 top-4 z-10 hidden h-8 w-8 translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface text-sm font-semibold text-brand-dark shadow-sm transition hover:bg-brand-soft lg:flex"
      >
        {collapsed ? ">" : "<"}
      </button>

      <div className={`flex flex-col gap-6 px-5 py-5 ${collapsed ? "lg:px-2 lg:items-center" : ""}`}>
        <div className={collapsed ? "lg:hidden" : ""}>
          <p className="font-display text-2xl font-semibold tracking-tight">
            QuadroHE
          </p>
          <p className="mt-1 text-sm text-brand-soft/90">
            Hora Extra + Alocações
          </p>
        </div>

        {collapsed ? (
          <p
            className="hidden font-display text-lg font-semibold tracking-tight lg:block"
            title="QuadroHE"
          >
            Q
          </p>
        ) : null}

        <nav
          className={`flex flex-wrap gap-2 lg:flex-col lg:gap-1 ${
            collapsed ? "lg:items-center" : ""
          }`}
        >
          {links.map((link) => (
            <NavLink
              key={link.href}
              to={link.href}
              end={link.end}
              title={link.label}
              className={({ isActive }) =>
                `rounded-md text-sm transition ${
                  collapsed ? "lg:px-2 lg:py-2" : "px-3 py-2"
                } ${
                  isActive
                    ? "bg-white text-brand-dark"
                    : "text-brand-soft hover:bg-white/10"
                }`
              }
            >
              <span className={collapsed ? "lg:hidden" : ""}>{link.label}</span>
              <span className={`hidden ${collapsed ? "lg:inline" : ""}`}>
                {link.label.charAt(0)}
              </span>
            </NavLink>
          ))}
        </nav>

        <div
          className={`mt-auto space-y-2 border-t border-white/15 pt-4 text-sm ${
            collapsed ? "lg:hidden" : ""
          }`}
        >
          {user ? (
            <p className="truncate text-brand-soft" title={user.email}>
              {user.email}
            </p>
          ) : null}
          <button
            type="button"
            onClick={logout}
            className="rounded-md border border-white/25 px-3 py-1.5 text-brand-soft transition hover:bg-white/10"
          >
            Sair
          </button>
        </div>

        {collapsed ? (
          <button
            type="button"
            onClick={logout}
            title="Sair"
            aria-label="Sair"
            className="mt-auto hidden h-8 w-8 items-center justify-center rounded-md border border-white/25 text-sm text-brand-soft transition hover:bg-white/10 lg:flex"
          >
            ⏻
          </button>
        ) : null}
      </div>
    </aside>
  );
}
