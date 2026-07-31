import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PageContainer from "../Layout/PageContainer";
import Spinner from "../common/Spinner";
import { useAccounts } from "../../hooks/useAccounts";
import { useToastStore } from "../../store/toast";
import { authenticate, AuthenticationError } from "../../apple/authenticate";
import { getErrorMessage } from "../../utils/error";
import { storeIdToCountry } from "../../apple/config";

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
      <div className="max-w-2xl space-y-6">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10 sm:p-6">
          <dl className="divide-y divide-gray-100 dark:divide-gray-800">
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
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10 sm:p-6">
            <label
              htmlFor="reauth-code"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {t("accounts.detail.code")}
            </label>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
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
                className="min-h-11 w-full min-w-0 flex-1 rounded-xl border-0 bg-gray-100 px-3 py-2 text-base text-gray-900 focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60 dark:bg-gray-800 dark:text-white"
                autoFocus
              />
              <button
                onClick={handleReauth}
                disabled={reauthing || !reauthCode}
                className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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
            className="flex min-h-11 items-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reauthing && <Spinner />}
            {t("accounts.detail.reauth")}
          </button>

          {!showDelete ? (
            <button
              onClick={() => setShowDelete(true)}
              className="min-h-11 rounded-full bg-red-50 px-5 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70"
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
                className="min-h-11 rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                {t("accounts.detail.confirmDelete")}
              </button>
              <button
                onClick={() => setShowDelete(false)}
                className="min-h-11 rounded-full bg-gray-200 px-5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {t("accounts.detail.cancel")}
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => navigate("/accounts")}
          className="mt-2 inline-block min-h-11 rounded-full bg-gray-200 px-5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {t("accounts.detail.back")}
        </button>
      </div>
    </PageContainer>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-gray-900 dark:text-white break-all">
        {value || "--"}
      </dd>
    </div>
  );
}
