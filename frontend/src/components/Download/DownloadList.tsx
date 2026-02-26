import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PageContainer from "../Layout/PageContainer";
import DownloadItem from "./DownloadItem";
import { useDownloads } from "../../hooks/useDownloads";
import { useAccounts } from "../../hooks/useAccounts";
import { useToastStore } from "../../store/toast";
import { getAccountContext } from "../../utils/toast";
import type { DownloadTask } from "../../types";

// Added imports for the update check feature
import { lookupApp } from "../../api/search";
import { storeIdToCountry } from "../../apple/config";
import { useDownloadAction } from "../../hooks/useDownloadAction";

type StatusFilter = "all" | DownloadTask["status"];

// Helper function to create a delay to avoid rate limits / 创建一个延迟函数的辅助工具，避免触发速率限制
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function DownloadList() {
  const { t } = useTranslation();
  const {
    tasks,
    loading,
    pauseDownload,
    resumeDownload,
    deleteDownload,
    hashToEmail,
  } = useDownloads();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const addToast = useToastStore((s) => s.addToast);
  const { accounts } = useAccounts();
  const { startDownload } = useDownloadAction();

  // State to manage the loading status of the bulk update process
  const [checkingAll, setCheckingAll] = useState(false);
  
  // Ref to immediately intercept and cancel the checking loop / 用于立即拦截并取消检查循环的引用
  const cancelCheckRef = useRef(false);
  
  // State to track the progress and current app name / 用于跟踪进度和当前应用名称的状态
  const [checkProgress, setCheckProgress] = useState({ current: 0, total: 0, appName: "" });

  // Cleanup effect: Cancel the check if the component unmounts (user navigates away) / 清理副作用：如果组件卸载（用户离开页面），则取消检查
  useEffect(() => {
    return () => {
      cancelCheckRef.current = true;
    };
  }, []);

  const filtered =
    filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  const sortedTasks = [...filtered].sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  function handleDelete(id: string) {
    if (!confirm(t("downloads.deleteConfirm"))) return;

    const task = tasks.find((t) => t.id === id);
    if (task) {
      const accountEmail = hashToEmail[task.accountHash];
      const account = accounts.find((a) => a.email === accountEmail);
      const ctx = getAccountContext(account, t);

      addToast(
        t("toast.msg", { appName: task.software.name, ...ctx }),
        "success",
        t("toast.title.deleteSuccess"),
      );
    }

    deleteDownload(id);
  }

  // Cancel the ongoing bulk update check / 取消正在进行的批量更新检查
  function handleCancelCheck() {
    cancelCheckRef.current = true;
    setCheckingAll(false);
  }

  // Handle checking and applying updates for all completed tasks
  async function handleCheckAllUpdates() {
    cancelCheckRef.current = false;
    setCheckingAll(true);
    addToast(t("downloads.checkUpdatesStarted"), "info");
    let count = 0;
    const completedTasks = tasks.filter((t) => t.status === "completed");
    
    // Initialize the progress state / 初始化进度状态
    setCheckProgress({ current: 0, total: completedTasks.length, appName: "" });
    
    for (let i = 0; i < completedTasks.length; i++) {
      // Break the loop if user clicked cancel or left the page / 如果用户点击了取消或离开页面，则中断循环
      if (cancelCheckRef.current) break;
        
      const task = completedTasks[i];
      const accountEmail = hashToEmail[task.accountHash];
      const account = accounts.find((a) => a.email === accountEmail);
      
      // Update the name of the app currently being checked / 更新当前正在检查的应用名称
      setCheckProgress((prev) => ({ ...prev, appName: task.software.name }));
      
      if (!account) {
        // Update progress even if skipped / 即使跳过也更新进度
        setCheckProgress((prev) => ({ ...prev, current: i + 1 }));
        continue;
      }

      try {
        // Add a delay to prevent hitting Apple's API rate limits / 添加延迟以防止触发苹果API的速率限制
        await delay(1500);
        
        // Double check cancellation after delay / 延迟后再次检查是否取消
        if (cancelCheckRef.current) break;

        const country = storeIdToCountry(account.store);
        const latestApp = await lookupApp(task.software.bundleID, country);
        
        // If a newer version is found, start download and replace the old one
        if (latestApp && latestApp.version !== task.software.version) {
          await startDownload(account, latestApp);
          await deleteDownload(task.id);
          count++;
        }
      } catch (err) {
        // Silently continue with the next item on error
      }
      
      // Update progress after each item is processed / 处理完每个项目后更新进度
      setCheckProgress((prev) => ({ ...prev, current: i + 1 }));
    }
    
    // Only show success message if it wasn't cancelled / 仅在未取消时显示成功消息
    if (!cancelCheckRef.current) {
      // Add a small 500ms delay so the user can see the progress bar hit 100% before it vanishes / 添加 500ms 延迟让用户能看清进度条走到 100%
      await delay(500);
      
      // Safety check again in case component unmounted during the 500ms wait / 再次安全检查以防在 500ms 等待期间组件被卸载
      if (!cancelCheckRef.current) {
        setCheckingAll(false);
        addToast(t("downloads.checkUpdatesCompleted", { count }), "success");
      }
    }
  }

  return (
    <PageContainer
      title={t("downloads.title")}
      action={
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            {/* Check All Updates Button */}
            <button
              onClick={handleCheckAllUpdates}
              disabled={checkingAll}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {checkingAll
                ? t("downloads.checkingUpdates")
                : t("downloads.checkUpdates")}
            </button>
            <Link
              to="/downloads/add"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center"
            >
              {t("downloads.new")}
            </Link>
          </div>
        </div>
      }
    >
      <div className="mb-4 flex gap-2 flex-wrap">
        {(
          [
            "all",
            "downloading",
            "pending",
            "paused",
            "completed",
            "failed",
          ] as StatusFilter[]
        ).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === status
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {t(`downloads.status.${status}`)}
            {status !== "all" && (
              <span className="ml-1">
                ({tasks.filter((t) => t.status === status).length})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400">
        {t("downloads.warning")}
      </div>

      {loading && tasks.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400 py-12">
          {t("downloads.loading")}
        </div>
      ) : sortedTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 my-4 bg-gray-50 dark:bg-gray-900/30 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-full shadow-sm mb-4 border border-gray-100 dark:border-gray-700">
            <svg
              className="w-12 h-12 text-blue-500 dark:text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 text-center">
            {filter === "all"
              ? t("downloads.emptyAll")
              : t("downloads.emptyFilter", {
                  status: t(`downloads.status.${filter}`),
                })}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center max-w-sm">
            {filter === "all"
              ? t("downloads.emptyAllDesc")
              : t("downloads.emptyFilterDesc")}
          </p>
          {filter === "all" && (
            <Link
              to="/search"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 hover:shadow-md transition-all active:scale-95"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              {t("downloads.searchApps")}
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sortedTasks.map((task) => (
            <DownloadItem
              key={task.id}
              task={task}
              onPause={pauseDownload}
              onResume={resumeDownload}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Bulk Update Progress Modal Overlay / 批量更新进度模态遮罩层 */}
      {checkingAll && checkProgress.total > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/50 transition-opacity duration-300">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 p-8 w-full max-w-md transform transition-all scale-100 opacity-100">
            <div className="flex flex-col items-center gap-6">
              {/* Spinning Loader Icon / 旋转的加载图标 */}
              <div className="relative flex items-center justify-center">
                <svg className="animate-spin h-10 w-10 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>

              {/* Status Text, App Name and Count / 状态文本、应用名称与计数 */}
              <div className="text-center w-full">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  {t("downloads.checkingUpdates")}
                </h3>
                <div className="bg-gray-50 dark:bg-gray-800/50 py-2 px-4 rounded-lg inline-block w-full max-w-[280px]">
                  <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 truncate">
                    {checkProgress.appName ? (
                      <>
                        <span className="text-gray-500 dark:text-gray-400 font-normal mr-1">
                          {t("downloads.checkingApp")}
                        </span>
                        {checkProgress.appName}
                      </>
                    ) : (
                      "..."
                    )}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">
                    {checkProgress.current} / {checkProgress.total}
                  </p>
                </div>
              </div>

              {/* Progress Bar Container / 进度条容器 */}
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3 overflow-hidden border border-gray-200 dark:border-gray-700 shadow-inner">
                <div
                  className="bg-green-500 h-full rounded-full transition-all duration-300 ease-out shadow"
                  style={{ width: `${(checkProgress.current / checkProgress.total) * 100}%` }}
                ></div>
              </div>
              
              {/* Localized the description text for the bulk update check process / 本地化批量更新检查过程的描述文本 */}
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-xs leading-relaxed">
                {t("downloads.checkUpdatesDesc")}
              </p>

              {/* Cancel Button / 取消按钮 */}
              <button
                onClick={handleCancelCheck}
                className="mt-2 px-6 py-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-all active:scale-95"
              >
                {t("settings.data.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
