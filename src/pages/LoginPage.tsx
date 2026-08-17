import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { ErrorBanner, Field, btnPrimary, btnSecondary, inputClass } from "@/components/ui";

export function LoginPage() {
  const { user, loading, login, confirmMfa } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);

  if (!loading && user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mfaToken) {
        await confirmMfa(mfaToken, code);
        return;
      }
      const challenge = await login(email, password);
      if (challenge?.mfa_token) {
        setMfaToken(challenge.mfa_token);
        setSetupSecret(challenge.secret ?? null);
        setPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setSubmitting(false);
    }
  }

  const mfaStep = Boolean(mfaToken);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <p className="font-display text-3xl font-semibold text-brand-dark">
          QuadroHE
        </p>
        <p className="mt-2 text-sm text-muted">
          Acesso da equipe da Secretaria de Educação
        </p>

        <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4">
          <ErrorBanner message={error} />
          {mfaStep ? (
            <>
              {setupSecret ? (
                <p className="text-sm text-muted">
                  Cadastre este código no autenticador e informe o código de 6
                  dígitos:{" "}
                  <span className="font-mono text-ink break-all">{setupSecret}</span>
                </p>
              ) : (
                <p className="text-sm text-muted">
                  Informe o código de 6 dígitos do autenticador.
                </p>
              )}
              <Field label="Código de verificação">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  minLength={6}
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </Field>
              <button className={`${btnPrimary} w-full`} disabled={submitting}>
                {submitting ? "Verificando..." : "Confirmar"}
              </button>
              <button
                type="button"
                className={`${btnSecondary} w-full`}
                disabled={submitting}
                onClick={() => {
                  setMfaToken(null);
                  setSetupSecret(null);
                  setCode("");
                  setError(null);
                }}
              >
                Voltar
              </button>
            </>
          ) : (
            <>
              <Field label="E-mail">
                <input
                  className={inputClass}
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Senha">
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <button className={`${btnPrimary} w-full`} disabled={submitting}>
                {submitting ? "Entrando..." : "Entrar"}
              </button>
            </>
          )}
        </form>
      </div>
    </main>
  );
}
