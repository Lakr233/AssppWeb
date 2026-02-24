import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PageContainer from "../Layout/PageContainer";
import Spinner from "../common/Spinner";
import { useAccounts } from "../../hooks/useAccounts";
import { useToastStore } from "../../store/toast";
import { authenticate, AuthenticationError } from "../../apple/authenticate";
import { storeIdToCountry } from "../../apple/config";
import { getErrorMessage } from "../../utils/error";

export default function AccountDetail() {
  const { email } = useParams<{ email: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const {
    accounts,
    loading: storeLoading,
    loadAccounts,
    updateAccount,
    removeAccount,
  } = useAccounts();
  const addToast = useToastStore((s) => s.addToast);

  const [showDelete, setShowDelete] = useState(false);
  const [reauthing, setReauthing] = useState(false);
  const [reauthCode, setReauthCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const decodedEmail = email ? decodeURIComponent(email) : "";
  const account = accounts.find((a) => a.email === decodedEmail);

  if (storeLoading) {
    return (
      <PageContainer title={t("accounts.title")}>
        <div className="text-center text-gray-500 py-12">{t("loading")}</div>
      </PageContainer>
    );
  }

  if (!account) {
    return (
      <PageContainer title={t("accounts.title")}>
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">{t("accounts.detail.notFound")}</p>
          <button
            onClick={() => navigate("/accounts")}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            {t("accounts.detail.back")}
          </button>
        </div>
      </PageContainer>
    );
  }

  async function handleReauth() {
    if (!account) return;
    setReauthing(true);

    try {
      const updated = await authenticate(
        account.email,
        account.password,
        needsCode && reauthCode ? reauthCode : undefined,
        account.cookies,
        account.deviceIdentifier,
      );
      await updateAccount(updated);
      setNeedsCode(false);
      setReauthCode("");
      addToast(t("accounts.detail.reauthSuccess"), "success");
    } catch (err) {
      if (err instanceof AuthenticationError && err.codeRequired) {
        setNeedsCode(true);
        addToast(err.message, "error");
      } else {
        addToast(
          getErrorMessage(err, t("accounts.detail.reauthFailed")),
          "error",
        );
      }
    } finally {
      setReauthing(false);
    }
  }

  async function handleDelete() {
    if (!account) return;
    await removeAccount(account.email);
    addToast(t("accounts.detail.deleteSuccess"), "success");
    navigate("/accounts");
  }

  const countryCode = storeIdToCountry(account.store);
  const displayRegion = countryCode
    ? `${t(`countries.${countryCode}`, countryCode)} (${account.store})`
    : account.store;

  return (
    <PageContainer title={t("accounts.detail.title")}>
      <div className="max-w-lg space-y-6">
        <section className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <dl className="space-y-4">
            <DetailRow
              label={t("accounts.detail.name")}
              value={`${account.firstName} ${account.lastName}`}
            />
            <DetailRow
              label={t("accounts.detail.email")}
              value={account.email}
            />
            <DetailRow
              label={t("accounts.detail.appleId")}
              value={account.appleId || account.email}
            />
            <DetailRow
              label={t("accounts.detail.storeRegion")}
              value={displayRegion}
            />
            <DetailRow
              label={t("accounts.detail.dsid")}
              value={account.directoryServicesIdentifier}
            />
            <DetailRow
              label={t("accounts.detail.deviceId")}
              value={account.deviceIdentifier}
            />
            {account.pod && (
              <DetailRow label={t("accounts.detail.pod")} value={account.pod} />
            )}
          </dl>
        </section>

        {needsCode && (
          <section className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
            <label
              htmlFor="reauth-code"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {t("accounts.detail.code")}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="reauth-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={reauthCode}
                onChange={(e) => setReauthCode(e.target.value)}
                disabled={reauthing}
                placeholder="000000"
                className="block flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 dark:disabled:bg-gray-800/50 transition-colors"
                autoFocus
              />
              <button
                onClick={handleReauth}
                disabled={reauthing || !reauthCode}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
              >
                {reauthing && <Spinner />}
                {t("accounts.detail.verify")}
              </button>
            </div>
          </section>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleReauth}
            disabled={reauthing}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {reauthing && <Spinner />}
            {t("accounts.detail.reauth")}
          </button>

          {!showDelete ? (
            <button
              onClick={() => setShowDelete(true)}
              className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            >
              {t("accounts.detail.delete")}
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t("accounts.detail.areYouSure")}
              </span>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                {t("accounts.detail.confirmDelete")}
              </button>
              <button
                onClick={() => setShowDelete(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {t("accounts.detail.cancel")}
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => navigate("/accounts")}
          className="px-4 py-2 mt-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors inline-block"
        >
          {t("accounts.detail.back")}
        </button>
      </div>
    </PageContainer>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-gray-900 dark:text-white break-all">
        {value || "--"}
      </dd>
    </div>
  );
}
