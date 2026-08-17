import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, setToken } from "./api";

export type PapelUsuario = "admin" | "operador";

export type User = {
  id: string;
  email: string;
  nome: string;
  papel: PapelUsuario;
};

export type LoginChallenge = {
  mfa_required?: boolean;
  mfa_setup_required?: boolean;
  mfa_token: string;
  otpauth_url?: string;
  secret?: string;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<LoginChallenge | void>;
  confirmMfa: (mfaToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeUser(raw: User): User {
  return {
    ...raw,
    papel: raw.papel === "admin" ? "admin" : "operador",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: User }>("/auth/me")
      .then((data) => setUser(normalizeUser(data.user)))
      .catch(() => {
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{
      token?: string;
      user?: User;
      mfa_required?: boolean;
      mfa_setup_required?: boolean;
      mfa_token?: string;
      otpauth_url?: string;
      secret?: string;
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (data.mfa_required || data.mfa_setup_required) {
      if (!data.mfa_token) {
        throw new Error("Falha no login");
      }
      return {
        mfa_required: data.mfa_required,
        mfa_setup_required: data.mfa_setup_required,
        mfa_token: data.mfa_token,
        otpauth_url: data.otpauth_url,
        secret: data.secret,
      };
    }
    if (!data.user) throw new Error("Falha no login");
    if (data.token) setToken(data.token);
    setUser(normalizeUser(data.user));
  }, []);

  const confirmMfa = useCallback(async (mfaToken: string, code: string) => {
    const data = await api<{ token?: string; user: User }>("/auth/login/mfa", {
      method: "POST",
      body: JSON.stringify({ mfa_token: mfaToken, code }),
    });
    if (data.token) setToken(data.token);
    setUser(normalizeUser(data.user));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* encerra a sessão local mesmo se o servidor já tiver invalidado */
    }
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAdmin: user?.papel === "admin",
      login,
      confirmMfa,
      logout,
    }),
    [user, loading, login, confirmMfa, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fora do AuthProvider");
  return ctx;
}
