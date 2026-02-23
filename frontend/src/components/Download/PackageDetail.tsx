import { useParams, useNavigate } from "react-router-dom";
import PageContainer from "../Layout/PageContainer";
import AppIcon from "../common/AppIcon";
import Badge from "../common/Badge";
import ProgressBar from "../common/ProgressBar";
import { useDownloads } from "../../hooks/useDownloads";
import { getInstallInfo } from "../../api/install";
// Import pure frontend QR code generation library
import { QRCodeSVG } from "qrcode.react";

export default function PackageDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tasks, deleteDownload, pauseDownload, resumeDownload, hashToEmail } =
    useDownloads();

  const task = tasks.find((t) => t.id === id);

  if (!task) {
    return (
      <PageContainer title="Package">
        <div className="text-center py-12 text-gray-500">
          {tasks.length === 0 ? "Loading..." : "Download not found."}
        </div>
      </PageContainer>
    );
  }

  const isActive = task.status === "downloading" || task.status === "injecting";
  const isPaused = task.status === "paused";
  const isCompleted = task.status === "completed";
  const installInfo = isCompleted ? getInstallInfo(task.id) : null;

  async function handleDelete() {
    if (!confirm("Delete this download?")) return;
    await deleteDownload(task!.id);
    navigate("/downloads");
  }

  return (
    <PageContainer title="Package Details">
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <AppIcon
            url={task.software.artworkUrl}
            name={task.software.name}
            size="lg"
          />
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900">
              {task.software.name}
            </h2>
            <p className="text-gray-500">{task.software.artistName}</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge status={task.status} />
              <span className="text-sm text-gray-500">
                v{task.software.version}
              </span>
            </div>
          </div>
        </div>

        {(isActive || isPaused) && (
          <div>
            <ProgressBar progress={task.progress} />
            <div className="flex justify-between mt-1 text-sm text-gray-500">
              <span>{Math.round(task.progress)}%</span>
              {task.speed && isActive && <span>{task.speed}</span>}
            </div>
          </div>
        )}

        {task.error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {task.error}
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500 flex-shrink-0">Bundle ID</dt>
              <dd className="text-gray-900 min-w-0 truncate ml-4">
                {task.software.bundleID}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 flex-shrink-0">Version</dt>
              <dd className="text-gray-900">{task.software.version}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 flex-shrink-0">Account</dt>
              <dd className="text-gray-900 min-w-0 truncate ml-4">
                {hashToEmail[task.accountHash] || task.accountHash}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 flex-shrink-0">Created</dt>
              <dd className="text-gray-900">
                {new Date(task.createdAt).toLocaleString()}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap gap-3">
          {isCompleted && (
            <>
              {installInfo && (
                <div className="relative group flex items-center">
                  {/* Add relative container and group class to capture mouse hover events */}
                  <a
                    href={installInfo.installUrl}
                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Install on Device
                  </a>
                  
                  {/* QR code hover window: hidden by default, gracefully appears on hover via group-hover */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-200 z-50">
                    <div className="bg-white p-2 rounded-lg shadow-xl border border-gray-200 flex flex-col items-center">
                      {/* Render QR code using the pure frontend library qrcode.react to improve security and loading speed */}
                      <QRCodeSVG 
                        value={installInfo.installUrl} 
                        size={128}
                        className="mb-1"
                      />
                      <span className="text-xs text-gray-500 mt-1">Scan to install</span>
                      {/* Small triangle indicator at the bottom of the hover window, pointing to the button below */}
                      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-b border-r border-gray-200 transform rotate-45"></div>
                    </div>
                  </div>
                </div>
              )}
              <a
                href={`/api/packages/${task.id}/file?accountHash=${encodeURIComponent(task.accountHash)}`}
                download
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Download IPA
              </a>
            </>
          )}
          {isActive && (
            <button
              onClick={() => pauseDownload(task.id)}
              className="px-4 py-2 text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Pause
            </button>
          )}
          {isPaused && (
            <button
              onClick={() => resumeDownload(task.id)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Resume
            </button>
          )}
          <button
            onClick={handleDelete}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </PageContainer>
  );
}
