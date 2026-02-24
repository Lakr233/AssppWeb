import { useTranslation } from "react-i18next";
import { useAccounts } from "./useAccounts";
import { useToastStore } from "../store/toast";
import { useDownloadsStore } from "../store/downloads";
import { getDownloadInfo } from "../apple/download";
import { purchaseApp } from "../apple/purchase";
import { authenticate } from "../apple/authenticate";
import { apiPost } from "../api/client";
import { accountHash } from "../utils/account";
import { getErrorMessage } from "../utils/error";
import { getAccountContext } from "../utils/toast";
import type { Account, Software } from "../types";

/**
 * Shared hook for download & purchase actions.
 * Eliminates the duplicated flow across ProductDetail, VersionHistory, and AddDownload.
 */
export function useDownloadAction() {
  const { updateAccount } = useAccounts();
  const addToast = useToastStore((s) => s.addToast);
  const fetchTasks = useDownloadsStore((s) => s.fetchTasks);
  const { t } = useTranslation();

  async function startDownload(
    account: Account,
    app: Software,
    versionId?: string,
  ) {
    const ctx = getAccountContext(account, t);
    const appName = app.name;

    const { output, updatedCookies } = await getDownloadInfo(
      account,
      app,
      versionId,
    );
    await updateAccount({ ...account, cookies: updatedCookies });
    const hash = await accountHash(account);

    await apiPost("/api/downloads", {
      software: { ...app, version: output.bundleShortVersionString },
      accountHash: hash,
      downloadURL: output.downloadURL,
      sinfs: output.sinfs,
      iTunesMetadata: output.iTunesMetadata,
    });

    fetchTasks();

    addToast(
      t("toast.msg", { appName, ...ctx }),
      "info",
      t("toast.title.downloadStarted"),
    );
  }

  async function acquireLicense(account: Account, app: Software) {
    const ctx = getAccountContext(account, t);
    const appName = app.name;

    // Silently renew the password token before purchasing.
    // This prevents "token expired" (2034/2042) errors that would
    // otherwise require the user to manually re-authenticate.
    let currentAccount = account;
    try {
      const renewed = await authenticate(
        account.email,
        account.password,
        undefined,
        account.cookies,
        account.deviceIdentifier,
      );
      await updateAccount(renewed);
      currentAccount = renewed;
    } catch {
      // Ignore — proceed with existing token
    }

    const result = await purchaseApp(currentAccount, app);
    await updateAccount({ ...currentAccount, cookies: result.updatedCookies });

    addToast(
      t("toast.msg", { appName, ...ctx }),
      "success",
      t("toast.title.licenseSuccess"),
    );
  }

  function toastDownloadError(account: Account, app: Software, error: unknown) {
    const ctx = getAccountContext(account, t);
    addToast(
      t("toast.msgFailed", {
        appName: app.name,
        ...ctx,
        error: getErrorMessage(error, t("toast.title.downloadFailed")),
      }),
      "error",
      t("toast.title.downloadFailed"),
    );
  }

  function toastLicenseError(account: Account, app: Software, error: unknown) {
    const ctx = getAccountContext(account, t);
    addToast(
      t("toast.msgFailed", {
        appName: app.name,
        ...ctx,
        error: getErrorMessage(error, t("toast.title.licenseFailed")),
      }),
      "error",
      t("toast.title.licenseFailed"),
    );
  }

  return {
    startDownload,
    acquireLicense,
    toastDownloadError,
    toastLicenseError,
  };
}
