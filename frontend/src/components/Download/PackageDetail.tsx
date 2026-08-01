import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageContainer from '../Layout/PageContainer';
import AppIcon from '../common/AppIcon';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import ProgressBar from '../common/ProgressBar';
import PackageQuickActions from './PackageQuickActions';
import {
  isDownloadPreviewEnabled,
  isPreviewDownloadTask,
  previewDownloadTasks,
} from './previewTasks';
import { useAccounts } from '../../hooks/useAccounts';
import { useDownloadAction } from '../../hooks/useDownloadAction';
import { useDownloads } from '../../hooks/useDownloads';
import { useToastStore } from '../../store/toast';
import { listVersions } from '../../apple/versionFinder';
import { lookupApp } from '../../api/search';
import { formatBytes } from '../../utils/format';
import { getAccountContext } from '../../utils/toast';
import { isNewerVersion } from '../../utils/version';
import { storeIdToCountry } from '../../apple/config';
import type { Software } from '../../types';

export default function PackageDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { tasks, deleteDownload, pauseDownload, resumeDownload, hashToEmail } =
    useDownloads();
  const { accounts } = useAccounts();
  const { startDownload } = useDownloadAction();
  const addToast = useToastStore((state) => state.addToast);

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [latestApp, setLatestApp] = useState<Software | null>(null);
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState('');

  const previewEnabled = isDownloadPreviewEnabled(location.search);
  const taskPool = previewEnabled ? previewDownloadTasks : tasks;
  const task = taskPool.find((item) => item.id === id);

  if (!task) {
    return (
      <PageContainer title={t('downloads.package.title')}>
        <div className="py-12 text-center text-gray-500 dark:text-gray-400">
          {tasks.length === 0 ? t('loading') : t('downloads.package.notFound')}
        </div>
      </PageContainer>
    );
  }

  const isActive = task.status === 'downloading' || task.status === 'injecting';
  const isPaused = task.status === 'paused';
  const isCompleted = task.status === 'completed';
  const isPreview = isPreviewDownloadTask(task);
  const accountEmail = isPreview
    ? t('downloads.preview.account')
    : hashToEmail[task.accountHash];
  const account = accounts.find((item) => item.email === accountEmail);
  const accountLabel = accountEmail || task.accountHash;
  const appName = task.software.name;
  const taskId = task.id;
  const bundleID = task.software.bundleID;
  const currentVersion = task.software.version;

  function showPreviewNotice() {
    addToast(
      t('downloads.preview.actionHint'),
      'info',
      t('downloads.preview.badge'),
    );
  }

  async function handleDelete() {
    if (isPreview) {
      showPreviewNotice();
      return;
    }
    if (!confirm(t('downloads.package.deleteConfirm'))) return;

    await deleteDownload(taskId);
    const context = getAccountContext(account, t);
    addToast(
      t('toast.msg', { appName, ...context }),
      'success',
      t('toast.title.deleteSuccess'),
    );
    navigate('/downloads');
  }

  function handlePause() {
    if (isPreview) {
      showPreviewNotice();
      return;
    }
    pauseDownload(taskId);
  }

  function handleResume() {
    if (isPreview) {
      showPreviewNotice();
      return;
    }
    resumeDownload(taskId);
  }

  async function handleCheckUpdate() {
    if (isPreview) {
      showPreviewNotice();
      return;
    }
    if (!account) return;

    setCheckingUpdate(true);
    try {
      const country = storeIdToCountry(account.store) ?? 'US';
      const app = await lookupApp(bundleID, country);

      if (app && isNewerVersion(app.version, currentVersion)) {
        setLatestApp(app);
        const result = await listVersions(account, app);
        setAvailableVersions(result.versions);
        setSelectedVersion(result.versions[0] || '');
        setShowUpdateModal(true);
      } else {
        addToast(t('downloads.package.noUpdate'), 'info');
      }
    } catch {
      addToast(t('downloads.package.checkUpdateFailed'), 'error');
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function handleConfirmUpdate() {
    if (!account || !latestApp) return;

    setShowUpdateModal(false);
    try {
      const isLatest =
        availableVersions.length > 0 &&
        selectedVersion === availableVersions[0];
      await startDownload(
        account,
        latestApp,
        isLatest ? undefined : selectedVersion,
      );
      await deleteDownload(taskId);
      navigate('/downloads');
    } catch {
      addToast(t('downloads.package.updateFailed'), 'error');
    }
  }

  return (
    <PageContainer title={t('downloads.package.title')}>
      <div className="min-w-0 space-y-5">
        {isPreview && (
          <div className="flex min-w-0 items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
            <span className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded-full bg-blue-600 px-2 text-[10px] font-semibold uppercase tracking-wide text-white">
              {t('downloads.preview.badge')}
            </span>
            <p className="min-w-0 leading-5">
              {t('downloads.preview.description')}
            </p>
          </div>
        )}

        <section className="min-w-0 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:p-5">
          <div className="flex min-w-0 items-start gap-4">
            <AppIcon
              url={task.software.artworkUrl}
              name={task.software.name}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <h2
                title={task.software.name}
                className="break-words text-xl font-semibold text-gray-900 [overflow-wrap:anywhere] dark:text-white"
              >
                {task.software.name}
              </h2>
              <p
                title={task.software.artistName}
                className="mt-0.5 break-words text-sm text-gray-500 [overflow-wrap:anywhere] dark:text-gray-400"
              >
                {task.software.artistName}
              </p>
              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                <Badge status={task.status} />
                <span className="min-w-0 break-all text-sm text-gray-500 dark:text-gray-400">
                  v{task.software.version}
                </span>
              </div>
            </div>
          </div>

          {(isActive || isPaused) && (
            <div className="mt-4 min-w-0 border-t border-gray-100 pt-4 dark:border-gray-800">
              <ProgressBar
                progress={task.progress}
                label={task.software.name}
              />
              <div className="mt-1.5 flex min-w-0 justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
                <span>{Math.round(task.progress)}%</span>
                {task.speed && isActive && (
                  <span className="min-w-0 truncate text-right">
                    {task.speed}
                  </span>
                )}
              </div>
            </div>
          )}

          {task.error && (
            <p
              role="alert"
              className="mt-4 min-w-0 break-words rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 [overflow-wrap:anywhere] dark:bg-red-950/30 dark:text-red-400"
            >
              {task.error}
            </p>
          )}
        </section>

        <section
          aria-labelledby="package-information-title"
          className="min-w-0 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:p-5"
        >
          <h3
            id="package-information-title"
            className="text-base font-semibold text-gray-900 dark:text-white"
          >
            {t('downloads.package.information')}
          </h3>

          <dl className="mt-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
            <DetailTile
              label={t('downloads.package.size')}
              value={formatBytes(task.software.fileSizeBytes)}
            />
            <DetailTile
              label={t('downloads.package.minOs')}
              value={`iOS ${task.software.minimumOsVersion || '—'}`}
            />
            <DetailTile
              label={t('downloads.package.category')}
              value={task.software.primaryGenreName || '—'}
            />
            <DetailTile
              label={t('downloads.package.released')}
              value={formatDate(task.software.releaseDate)}
            />
          </dl>

          <dl className="mt-4 min-w-0 divide-y divide-gray-100 border-t border-gray-100 text-sm dark:divide-gray-800 dark:border-gray-800">
            <PackageDetailRow
              label={t('downloads.package.developer')}
              valueTitle={task.software.sellerName}
            >
              {task.software.sellerName || task.software.artistName}
            </PackageDetailRow>
            <PackageDetailRow
              label={t('downloads.package.bundleId')}
              valueTitle={task.software.bundleID}
              mono
            >
              {task.software.bundleID}
            </PackageDetailRow>
            <PackageDetailRow
              label={t('downloads.package.version')}
              valueTitle={task.software.version}
              mono
            >
              {task.software.version}
            </PackageDetailRow>
            <PackageDetailRow
              label={t('downloads.package.account')}
              valueTitle={accountLabel}
            >
              {accountLabel}
            </PackageDetailRow>
            <PackageDetailRow label={t('downloads.package.created')}>
              {new Date(task.createdAt).toLocaleString()}
            </PackageDetailRow>
          </dl>
        </section>

        <section
          aria-labelledby="package-actions-title"
          className="min-w-0 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:p-5"
        >
          <h3
            id="package-actions-title"
            className="text-base font-semibold text-gray-900 dark:text-white"
          >
            {t('downloads.package.quickActions')}
          </h3>

          {isCompleted && task.hasFile && (
            <div className="mt-4">
              <PackageQuickActions task={task} />
            </div>
          )}

          {isCompleted && !task.hasFile && (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              {t('downloads.package.fileUnavailable')}
            </p>
          )}

          <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
            {isCompleted && (
              <button
                type="button"
                onClick={handleCheckUpdate}
                disabled={checkingUpdate || (!account && !isPreview)}
                className="min-h-11 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {checkingUpdate
                  ? t('downloads.package.checkingUpdate')
                  : t('downloads.package.checkUpdate')}
              </button>
            )}
            {isActive && (
              <button
                type="button"
                onClick={handlePause}
                className="min-h-11 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {t('downloads.package.pause')}
              </button>
            )}
            {isPaused && (
              <button
                type="button"
                onClick={handleResume}
                className="min-h-11 min-w-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                {t('downloads.package.resume')}
              </button>
            )}
            <button
              type="button"
              onClick={handleDelete}
              className="min-h-11 min-w-0 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              {t('downloads.package.delete')}
            </button>
          </div>
        </section>
      </div>

      <Modal
        open={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        title={t('downloads.package.updateAvailable')}
      >
        <div className="min-w-0 space-y-4">
          <p className="min-w-0 break-words text-sm text-gray-600 [overflow-wrap:anywhere] dark:text-gray-300">
            {t('downloads.package.updatePrompt', {
              version: latestApp?.version,
            })}
          </p>
          {availableVersions.length > 0 && (
            <div className="min-w-0">
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('downloads.package.selectVersion')}
              </label>
              <select
                value={selectedVersion}
                onChange={(event) => setSelectedVersion(event.target.value)}
                className="min-h-11 w-full min-w-0 max-w-full truncate rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {availableVersions.map((version, index) => (
                  <option key={version} value={version}>
                    {index === 0
                      ? t('downloads.package.latestVersion', { id: version })
                      : version}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="mt-6 grid min-w-0 grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShowUpdateModal(false)}
              className="min-h-11 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {t('settings.data.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirmUpdate}
              className="min-h-11 min-w-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              {t('downloads.package.update')}
            </button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-gray-800/60">
      <dt className="truncate text-xs text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd
        title={value}
        className="mt-1 truncate text-sm font-medium text-gray-900 dark:text-gray-100"
      >
        {value}
      </dd>
    </div>
  );
}

function PackageDetailRow({
  label,
  children,
  mono = false,
  valueTitle,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
  valueTitle?: string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] items-start gap-4 py-2.5 sm:gap-6">
      <dt className="min-w-0 break-words text-gray-500 [overflow-wrap:anywhere] dark:text-gray-400">
        {label}
      </dt>
      <dd
        title={valueTitle}
        className={`min-w-0 max-w-full whitespace-pre-wrap break-all text-right text-gray-900 dark:text-gray-200 ${
          mono ? 'font-mono' : ''
        }`}
      >
        {children}
      </dd>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}
