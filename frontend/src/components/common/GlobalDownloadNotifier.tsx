// New invisible component to globally track background downloads and push real-time toast notifications
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useDownloads } from "../../hooks/useDownloads";
import { useAccounts } from "../../hooks/useAccounts";
import { useToastStore } from "../../store/toast";
import { storeIdToCountry } from "../../apple/config";
import type { DownloadTask } from "../../types";

export default function GlobalDownloadNotifier() {
  const { tasks, hashToEmail } = useDownloads();
  const { accounts } = useAccounts();
  const addToast = useToastStore((s) => s.addToast);
  const { t } = useTranslation();

  // Use refs to track previous states and dependencies without triggering unnecessary re-renders
  // 使用 ref 来追踪上一次的任务状态和依赖，避免不必要的重新渲染
  const prevTasksRef = useRef<Record<string, DownloadTask>>({});
  const depsRef = useRef({ hashToEmail, accounts, t, addToast });

  useEffect(() => {
    depsRef.current = { hashToEmail, accounts, t, addToast };
  }, [hashToEmail, accounts, t, addToast]);

  useEffect(() => {
    const prevTasks = prevTasksRef.current;
    const currentTasks: Record<string, DownloadTask> = {};
    const { hashToEmail, accounts, t, addToast } = depsRef.current;

    // Loop through all current background tasks / 遍历当前所有后台任务
    tasks.forEach((task) => {
      currentTasks[task.id] = task;
      const prevTask = prevTasks[task.id];

      // Only evaluate if we knew about the task previously (prevents spam on initial page load)
      // 只有在上一轮轮询中已经存在的任务发生状态转变时才通知（防止页面初次加载时刷屏）
      if (prevTask) {
        if (prevTask.status !== "completed" && task.status === "completed") {
          notify(task, "success");
        }
        if (prevTask.status !== "failed" && task.status === "failed") {
          notify(task, "failed");
        }
      }
    });

    // Update the ref for the next polling cycle / 更新 ref 供下一次轮询周期使用
    prevTasksRef.current = currentTasks;

    function notify(task: DownloadTask, type: "success" | "failed") {
      const accountEmail = hashToEmail[task.accountHash] || task.accountHash;
      const account = accounts.find((a) => a.email === accountEmail);
      const userName = account ? `${account.firstName} ${account.lastName}` : "Unknown";
      const appleId = account ? account.email : "Unknown";
      const appName = task.software.name;
      const rawCountryCode = account ? storeIdToCountry(account.store) || "" : "";
      const countryStr = rawCountryCode ? t(`countries.${rawCountryCode}`, rawCountryCode) : (account?.store || "Unknown");

      if (type === "success") {
        addToast(
          t("toast.msg", { appName, userName, appleId, country: countryStr }),
          "success",
          t("toast.title.downloadSuccess")
        );
      } else {
        addToast(
          t("toast.msgFailed", { appName, userName, appleId, country: countryStr, error: task.error || "Unknown error" }),
          "error",
          t("toast.title.downloadFailed")
        );
      }
    }
  }, [tasks]);

  // This component doesn't render anything / 这个组件不需要渲染任何 DOM
  return null;
}