import { useState, useEffect, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

const SESSION_KEY = "auth-token";

export function getAccessToken(): string | null {
  return sessionStorage.getItem(SESSION_KEY);
}

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function PasswordGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"loading" | "required" | "verified">(
    "loading",
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((data: { required: boolean }) => {
        if (!data.required || sessionStorage.getItem(SESSION_KEY)) {
          setStatus("verified");
        } else {
          setStatus("required");
        }
      })
      .catch(() => {
        // If we can't reach the server, let the app load normally
        setStatus("verified");
      });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const hash = await hashPassword(password);
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: hash }),
      });
      const data = (await res.json()) as { ok: boolean };

      if (data.ok) {
        sessionStorage.setItem(SESSION_KEY, hash);
        setStatus("verified");
      } else {
        setError(t("auth.error"));
      }
    } catch {
      setError(t("auth.error"));
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">{t("loading")}</p>
      </div>
    );
  }

  if (status === "verified") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white text-2xl font-semibold mb-4">
            A
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {t("auth.title")}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.placeholder")}
              autoFocus
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !password}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? t("auth.verifying") : t("auth.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
