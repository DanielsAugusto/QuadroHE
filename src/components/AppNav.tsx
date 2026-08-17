import { useEffect, useId, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
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

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      {open ? (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </>
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )}
    </svg>
  );
}

function NavItems({
  onNavigate,
  className = "",
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <nav className={className}>
      {links.map((link) => (
        <NavLink
          key={link.href}
          to={link.href}
          end={link.end}
          title={link.label}
          onClick={onNavigate}
          className={({ isActive }) =>
            `rounded-md px-3 py-2.5 text-sm transition ${
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
  );
}

function NavFooter({
  onNavigate,
  compact = false,
}: {
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const { logout, user } = useAuth();

  return (
    <div
      className={`mt-auto border-t border-white/15 pt-4 ${
        compact ? "flex items-center gap-2" : "space-y-3"
      }`}
    >
      {!compact && user ? (
        <p className="truncate px-1 text-xs text-brand-soft/90" title={user.email}>
          {user.nome}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <NavLink
          to="/configuracao"
          title="Configuração"
          aria-label="Configuração"
          onClick={onNavigate}
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
          onClick={() => {
            onNavigate?.();
            void logout();
          }}
          title="Sair"
          aria-label="Sair"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/25 text-brand-soft transition hover:bg-white/10"
        >
          <LogoutIcon />
        </button>
      </div>
    </div>
  );
}

export function AppNav() {
  const location = useLocation();
  const menuId = useId();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

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

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  return (
    <>
      {/* Barra mobile */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-brand-dark bg-brand px-4 py-3 text-white lg:hidden">
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold tracking-tight">
            QuadroHE
          </p>
          <p className="truncate text-xs text-brand-soft/90">
            Hora Extra + Alocações
          </p>
        </div>
        <button
          type="button"
          aria-label="Abrir menu"
          aria-expanded={mobileOpen}
          aria-controls={menuId}
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/25 text-white transition hover:bg-white/10"
        >
          <MenuIcon open={false} />
        </button>
      </header>

      {/* Drawer mobile */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <button
          type="button"
          aria-label="Fechar menu"
          tabIndex={mobileOpen ? 0 : -1}
          className={`absolute inset-0 bg-black/45 transition-opacity duration-200 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          id={menuId}
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
          className={`absolute inset-y-0 left-0 flex w-[min(18rem,86vw)] flex-col bg-brand text-white shadow-xl transition-transform duration-200 ease-out ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-start justify-between gap-3 border-b border-white/15 px-5 py-4">
            <div>
              <p className="font-display text-2xl font-semibold tracking-tight">
                QuadroHE
              </p>
              <p className="mt-1 text-sm text-brand-soft/90">
                Hora Extra + Alocações
              </p>
            </div>
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setMobileOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/25 text-brand-soft transition hover:bg-white/10"
            >
              <MenuIcon open />
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-5">
            <NavItems
              onNavigate={() => setMobileOpen(false)}
              className="flex flex-col gap-1"
            />
            <NavFooter onNavigate={() => setMobileOpen(false)} />
          </div>
        </aside>
      </div>

      {/* Sidebar desktop */}
      <aside
        className={`relative hidden shrink-0 flex-col border-r border-brand-dark bg-brand text-white transition-[width] duration-200 lg:sticky lg:top-0 lg:flex lg:h-screen lg:self-start ${
          collapsed ? "lg:w-14" : "lg:w-64"
        }`}
      >
        <button
          type="button"
          aria-label={collapsed ? "Abrir menu" : "Fechar menu"}
          title={collapsed ? "Abrir menu" : "Fechar menu"}
          onClick={() => setCollapsed((v) => !v)}
          className={`absolute z-20 flex items-center justify-center rounded-full shadow-md transition ${
            collapsed
              ? "left-1/2 top-4 h-9 w-9 -translate-x-1/2 bg-brand text-white ring-2 ring-white/30 hover:bg-brand-dark"
              : "right-0 top-4 h-8 w-8 translate-x-1/2 border border-border bg-surface text-brand-dark hover:bg-brand-soft"
          }`}
        >
          <ChevronIcon dir={collapsed ? "right" : "left"} />
        </button>

        {collapsed ? (
          <div
            className="flex h-full flex-col items-center gap-2.5 overflow-y-auto px-1 pt-16 pb-4"
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
          className={`flex h-full flex-col gap-6 px-5 py-5 ${
            collapsed ? "invisible h-0 overflow-hidden p-0" : ""
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

          <NavItems className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto" />
          <NavFooter compact />
        </div>
      </aside>
    </>
  );
}
