import { createElement } from "react"; // NEW: Imported createElement to avoid JSX syntax in .ts file
import { useTranslation } from "react-i18next";
import { useAccounts } from "./useAccounts";
import { useToastStore } from "../store/toast";
import { useDownloadsStore } from "../store/downloads";
import { getDownloadInfo } from "../apple/download";
import { purchaseApp } from "../apple/purchase";
import { authenticate } from "../apple/authenticate";
import { apiPost, apiGet } from "../api/client";
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

    // Check server download limit before processing Apple APIs
    // 在调用 Apple 接口前检查服务器下载限制大小
    try {
      const serverSettings = await apiGet<{ maxDownloadMB: number }>("/api/settings");
      if (serverSettings.maxDownloadMB > 0 && app.fileSizeBytes) {
        const sizeMB = parseInt(app.fileSizeBytes, 10) / (1024 * 1024);
        if (sizeMB > serverSettings.maxDownloadMB) {
          const formattedSize = sizeMB.toFixed(2);
          
          // NEW: Use React.createElement instead of JSX to bypass esbuild restrictions in .ts files
          // 新增：使用 React.createElement 替代 JSX 语法，解决 .ts 文件在 Vite 中的构建报错
          const msg = createElement(
            "div",
            { className: "flex flex-col gap-1" },
            createElement("div", null, appName),
            createElement("div", {
              dangerouslySetInnerHTML: {
                __html: t("toast.downloadLimit.line2", {
                  size: formattedSize,
                  limit: serverSettings.maxDownloadMB,
                }),
              },
            }),
            createElement("div", null, t("toast.downloadLimit.line3"))
          );

          addToast(msg, "error", t("toast.title.downloadLimit"));
          return; // Abort the download request
        }
      }
    } catch (err) {
      // Ignore settings fetch error and proceed naturally
      console.error("Failed to fetch server settings for limit check:", err);
    }

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
