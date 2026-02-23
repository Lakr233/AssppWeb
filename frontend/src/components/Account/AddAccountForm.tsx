import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PageContainer from "../Layout/PageContainer";
import Spinner from "../common/Spinner";
import Alert from "../common/Alert";
import { useAccounts } from "../../hooks/useAccounts";
import { authenticate, AuthenticationError } from "../../apple/authenticate";
import { generateDeviceId } from "../../apple/config";
import { getErrorMessage } from "../../utils/error";

export default function AddAccountForm() {
  const navigate = useNavigate();
  const { addAccount } = useAccounts();
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [deviceId, setDeviceId] = useState(() => generateDeviceId());
  const [needsCode, setNeedsCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // if deviceId contains space or ":", remove them and fill back to the input field
      const cleanedDeviceId = deviceId.replace(/[: ]/g, "");
      setDeviceId(cleanedDeviceId);

      const account = await authenticate(
        email,
        password,
        needsCode && code ? code : undefined,
        undefined,
        cleanedDeviceId,
      );
      await addAccount(account);
      navigate("/accounts");
    } catch (err) {
      if (err instanceof AuthenticationError && err.codeRequired) {
        setNeedsCode(true);
        setError(err.message);
      } else {
        setError(getErrorMessage(err, t("accounts.addForm.authFailed")));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageContainer title={t("accounts.addForm.title")}>
      <div className="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {t("accounts.addForm.email")}
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                placeholder={t("accounts.addForm.emailPlaceholder")}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {t("accounts.addForm.password")}
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>

            <div>
              <label
                htmlFor="deviceId"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {t("accounts.addForm.deviceId")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="deviceId"
                  type="text"
                  required
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  disabled={loading || needsCode}
                  className="block flex-1 h-[42px] rounded-md border border-gray-300 px-3 py-2 text-base font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                />
                <button
                  type="button"
                  onClick={() => setDeviceId(generateDeviceId())}
                  disabled={loading || needsCode}
                  className="h-[42px] px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t("accounts.addForm.randomize")}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {t("accounts.addForm.deviceIdHelp")}
              </p>
            </div>

            {needsCode && (
              <div>
                <label
                  htmlFor="code"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  {t("accounts.addForm.code")}
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={loading}
                  placeholder={t("accounts.addForm.codePlaceholder")}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  autoFocus
                />
                <p className="mt-1 text-xs text-gray-500">
                  {t("accounts.addForm.codeHelp")}
                </p>
              </div>
            )}
          </section>

          {error && (
            <Alert type="error" className="p-4">
              {error}
            </Alert>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && <Spinner />}
              {needsCode
                ? t("accounts.addForm.verify")
                : t("accounts.addForm.signIn")}
            </button>
            <button
              type="button"
              onClick={() => navigate("/accounts")}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {t("accounts.addForm.cancel")}
            </button>
          </div>
        </form>
      </div>
    </PageContainer>
  );
}
