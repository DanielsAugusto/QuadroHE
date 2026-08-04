import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/lib/auth";

const links = [
  { href: "/", label: "Dashboard", end: true },
  { href: "/hora-extra", label: "Hora Extra" },
  { href: "/escolas", label: "Escolas" },
  { href: "/carencias", label: "Carências" },
  { href: "/contagens", label: "Mapa Estatístico" },
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

function GearIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  );
}

function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      {dir === "left" ? (
        <path d="M15 6 9 12l6 6" />
      ) : (
        <path d="M9 6l6 6-6 6" />
      )}
    </svg>
  );
}

export function AppNav() {
  const { logout } = useAuth();
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
        className={`absolute z-20 hidden items-center justify-center rounded-full shadow-md transition lg:flex ${
          collapsed
            ? "left-1/2 top-4 h-9 w-9 -translate-x-1/2 bg-brand text-white ring-2 ring-white/30 hover:bg-brand-dark"
            : "right-0 top-4 h-8 w-8 translate-x-1/2 border border-border bg-surface text-brand-dark hover:bg-brand-soft"
        }`}
      >
        <ChevronIcon dir={collapsed ? "right" : "left"} />
      </button>

      {collapsed ? (
        <div
          className="hidden flex-1 flex-col items-center gap-2.5 px-1 pt-16 lg:flex"
          aria-hidden
        >
          {"MOVIMENTAÇÃO".split("").map((letter, i) => (
            <span
              key={`${letter}-${i}`}
              className="font-display text-xs font-semibold leading-none tracking-wide text-white/90"
            >
              {letter === " " ? "\u00A0" : letter}
            </span>
          ))}
        </div>
      ) : null}

      <div
        className={`flex flex-col gap-6 px-5 py-5 ${
          collapsed ? "lg:invisible lg:h-0 lg:overflow-hidden lg:p-0" : ""
        }`}
      >
        <div>
          <p className="font-display text-2xl font-semibold tracking-tight">
            QuadroHE
          </p>
          <p className="mt-1 text-sm text-brand-soft/90">
            Hora Extra + Alocações
          </p>
        </div>

        <nav className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
          {links.map((link) => (
            <NavLink
              key={link.href}
              to={link.href}
              end={link.end}
              title={link.label}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm transition ${
                  isActive
                    ? "bg-white text-brand-dark"
                    : "text-brand-soft hover:bg-white/10"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-2 border-t border-white/15 pt-4">
          <NavLink
            to="/configuracao"
            title="Configuração"
            aria-label="Configuração"
            className={({ isActive }) =>
              `inline-flex h-9 w-9 items-center justify-center rounded-md transition ${
                isActive
                  ? "bg-white text-brand-dark"
                  : "border border-white/25 text-brand-soft hover:bg-white/10"
              }`
            }
          >
            <GearIcon />
          </NavLink>
          <button
            type="button"
            onClick={logout}
            title="Sair"
            aria-label="Sair"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/25 text-brand-soft transition hover:bg-white/10"
          >
            <LogoutIcon />
          </button>
        </div>
      </div>
    </aside>
  );
}
