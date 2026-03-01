import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageContainer from '../../components/Layout/PageContainer';
import Alert from '../../components/common/Alert';
import ProgressBar from '../../components/common/ProgressBar';
import Spinner from '../../components/common/Spinner';
import { useToastStore } from '../../store/toast';
import { useSigningStore } from '../../stores/signingStore';
import { uploadSignedIpa } from '../../api/signing';
import {
  addAppID,
  addCertificate,
  fetchCertificates,
  fetchAppIDs,
  fetchProvisioningProfile,
  fetchTeam,
} from '../../apple/developerApi';
import { getAnisetteData } from '../../apple/anisetteService';
import { readIpaInfo } from '../../apple/ipaInfo';
import { hashAccountIdentity } from '../../utils/account';
import { getErrorMessage } from '../../utils/error';
import { createResigner } from '@lbr77/zsign-wasm-resigner-wrapper';
interface SigningLog {
  id: number;
  text: string;
}

interface ResignerLike {
  signIpa(
    inputIpa: Uint8Array,
    options: {
      cert: Uint8Array;
      pkey: Uint8Array;
      prov: Uint8Array;
      bundleId?: string;
      displayName?: string;
      adhoc?: boolean;
      forceSign?: boolean;
    }
  ): Promise<{ data: Uint8Array }>;
}

let resignerPromise: Promise<ResignerLike> | null = null;

async function getResigner(): Promise<ResignerLike> {
  if (!resignerPromise) {
    resignerPromise = createResigner();
  }

  return resignerPromise;
}

function buildOutputName(name: string): string {
  if (!name.toLowerCase().endsWith('.ipa')) {
    return `${name}-signed.ipa`;
  }

  return `${name.slice(0, -4)}-signed.ipa`;
}

function buildDisplayName(name: string): string {
  if (!name.toLowerCase().endsWith('.ipa')) {
    return name;
  }

  return name.slice(0, -4);
}

function buildTeamScopedBundleId(baseBundleId: string, teamId: string): string {
  const trimmedBase = baseBundleId.trim();
  if (!trimmedBase) {
    return trimmedBase;
  }

  const normalizedTeamId = teamId.trim();
  if (!normalizedTeamId) {
    return trimmedBase;
  }

  const lowerBase = trimmedBase.toLowerCase();
  const lowerTeam = normalizedTeamId.toLowerCase();
  if (lowerBase.endsWith(`.${lowerTeam}`)) {
    return trimmedBase;
  }

  return `${trimmedBase}.${normalizedTeamId}`;
}

function isSessionExpiredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('session has expired') || message.includes('(1100)');
}

export default function SigningIpa() {
  const { accounts, currentAccountId, updateAccount } = useSigningStore();
  const addToast = useToastStore((state) => state.addToast);
  const navigate = useNavigate();

  const currentAccount = useMemo(() => {
    if (!currentAccountId) {
      return accounts[0] ?? null;
    }

    return accounts.find((account) => account.id === currentAccountId) ?? null;
  }, [accounts, currentAccountId]);

  const [ipaFile, setIpaFile] = useState<File | null>(null);
  const [bundleId, setBundleId] = useState('com.example.signedapp');
  const [displayName, setDisplayName] = useState('');
  const [isSigning, setIsSigning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<SigningLog[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState('signed.ipa');
  const [ipaMetadataNotice, setIpaMetadataNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!downloadUrl) {
      return;
    }

    return () => {
      URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  useEffect(() => {
    if (accounts.length === 0) {
      navigate('/signing/login', { replace: true });
    }
  }, [accounts.length, navigate]);

  const canSign = !!currentAccount && !!ipaFile && bundleId.trim().length > 0 && !isSigning;
  const fileSizeMB = ipaFile ? `${(ipaFile.size / 1024 / 1024).toFixed(2)} MB` : null;
  const progressState =
    progress >= 100 ? 'Completed' : isSigning ? 'Signing in progress' : 'Ready to start';

  const appendLog = (text: string) => {
    setLogs((prev) => [...prev, { id: Date.now() + Math.floor(Math.random() * 1000), text }]);
  };

  const updateProgress = (value: number, text: string) => {
    setProgress(value);
    appendLog(text);
  };

  const handleIpaFileChange = async (file: File | null) => {
    setIpaFile(file);
    setIpaMetadataNotice(null);

    if (!file) {
      return;
    }

    try {
      const ipaBytes = new Uint8Array(await file.arrayBuffer());
      const info = readIpaInfo(ipaBytes);
      console.log('Parsed IPA info:', info);
      if (info.bundleId) {
        setBundleId(info.bundleId);
      }
      if (info.displayName) {
        const nextDisplayName = info.displayName;
        setDisplayName((current) => (current.trim().length > 0 ? current : nextDisplayName));
      }

      if (info.bundleId) {
        setIpaMetadataNotice(`Detected Bundle ID from Info.plist: ${info.bundleId}`);
      } else {
        setIpaMetadataNotice('Info.plist loaded, but CFBundleIdentifier was not found.');
      }
    } catch {
      setIpaMetadataNotice('Unable to read Info.plist from this IPA. Please enter Bundle ID manually.');
    }
  };

  const handleSign = async () => {
    if (!currentAccount || !ipaFile || !bundleId.trim()) {
      return;
    }

    setError(null);
    setLogs([]);
    setProgress(2);
    setIsSigning(true);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    try {
      updateProgress(8, 'Reading IPA from browser...');
      const ipaData = new Uint8Array(await ipaFile.arrayBuffer());

      updateProgress(16, 'Refreshing anisette data...');
      const anisetteData = await getAnisetteData();
      const session = { ...currentAccount.session, anisetteData };

      updateProgress(24, 'Validating session and fetching team...');
      const team = await fetchTeam(session);
      updateAccount(currentAccount.id, { session, team });

      if (!team) {
        throw new Error('No team available for this account.');
      }

      updateProgress(32, 'Fetching latest certificates...');
      const latestCertificates = await fetchCertificates(session, team);
      const localPrivateKeyById = new Map<string, Uint8Array>();
      for (const item of currentAccount.certificates) {
        if (item.privateKey) {
          localPrivateKeyById.set(item.identifier, item.privateKey);
        }
      }

      let nextCertificates = latestCertificates.map((item) => {
        const localPrivateKey = localPrivateKeyById.get(item.identifier);
        if (!localPrivateKey) {
          return item;
        }

        return { ...item, privateKey: localPrivateKey };
      });

      let certificate =
        nextCertificates.find((item) => item.identifier === currentAccount.selectedCertificateId) ??
        nextCertificates[0];
      let privateKey = certificate?.privateKey ?? currentAccount.privateKey;

      if (!certificate || !privateKey) {
        updateProgress(42, 'Creating development certificate...');
        const created = await addCertificate(session, team, `AssppWeb-${Date.now()}`);

        privateKey = created.privateKey;
        certificate = { ...created.certificate, privateKey };
        nextCertificates = [
          certificate,
          ...nextCertificates.filter((item) => item.identifier !== certificate.identifier),
        ];
        updateAccount(currentAccount.id, {
          certificates: nextCertificates,
          selectedCertificateId: certificate.identifier,
          privateKey,
        });
      }

      if (!certificate || !privateKey) {
        throw new Error('Missing certificate/private key for signing.');
      }

      updateProgress(55, 'Checking App ID...');
      const normalizedBundleId = bundleId.trim();
      const finalBundleId = buildTeamScopedBundleId(normalizedBundleId, team.identifier);
      if (finalBundleId !== normalizedBundleId) {
        appendLog(`Using team-scoped bundle ID: ${finalBundleId}`);
      }

      const appIDs = await fetchAppIDs(session, team);
      let appID = appIDs.find((item) => item.bundleIdentifier === finalBundleId);

      if (!appID) {
        updateProgress(64, 'Creating App ID...');
        try {
          appID = await addAppID(session, team, displayName.trim() || 'Signed App', finalBundleId);
        } catch (error) {
          const reason = getErrorMessage(error, 'unknown reason');
          throw new Error(`Failed to add App ID (${finalBundleId}): ${reason}`);
        }
      }

      updateProgress(73, 'Fetching provisioning profile...');
      const profile = await fetchProvisioningProfile(session, team, appID);

      updateProgress(82, 'Initializing signer WASM...');
      const resigner = await getResigner();

      updateProgress(90, 'Signing IPA in browser...');
      const signedResult = await resigner.signIpa(ipaData, {
        cert: certificate.publicKey,
        pkey: privateKey,
        prov: profile.data,
        bundleId: finalBundleId,
        displayName: displayName.trim() || undefined,
        adhoc: false,
        forceSign: true,
      });

      updateProgress(96, 'Building downloadable file...');
      const outputName = buildOutputName(ipaFile.name);
      const signedData = signedResult.data;
      const signedBuffer = new ArrayBuffer(signedData.byteLength);
      new Uint8Array(signedBuffer).set(signedData);
      const signedBlob = new Blob([signedBuffer], { type: 'application/octet-stream' });
      const objectUrl = URL.createObjectURL(signedBlob);
      const uploadName = displayName.trim() || buildDisplayName(ipaFile.name);

      setDownloadName(outputName);
      setDownloadUrl(objectUrl);

      updateProgress(98, 'Uploading signed IPA to backend...');
      const uploadAccountHash = await hashAccountIdentity({
        directoryServicesIdentifier: currentAccount.session.dsid,
        appleId: currentAccount.account.email,
        email: currentAccount.email,
      });
      const uploadedTask = await uploadSignedIpa({
        ipaBlob: signedBlob,
        accountHash: uploadAccountHash,
        bundleID: finalBundleId,
        name: uploadName,
      });

      setProgress(100);
      appendLog(`Uploaded to backend (task: ${uploadedTask.id}).`);
      appendLog('Signing complete.');
      addToast(`Signed IPA uploaded: ${uploadName}`, 'success', 'Upload Completed');
      addToast(`Signed IPA ready: ${outputName}`, 'success', 'Signing Completed');
    } catch (signError) {
      const message = getErrorMessage(signError, 'Signing failed.');
      setError(message);
      appendLog(`Error: ${message}`);

      if (isSessionExpiredError(signError)) {
        addToast('Session expired. Please sign in again.', 'info', 'Session Expired');
      }
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <PageContainer
      title="Sign IPA"
      action={
        <button
          type="button"
          onClick={() => navigate('/signing/accounts')}
          className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Back to Accounts
        </button>
      }
    >
      <div className="mx-auto max-w-5xl space-y-4">
        {error && <Alert type="error">{error}</Alert>}

        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Upload an IPA, then sign locally in browser with your active Apple Developer
                account.
              </p>
              {currentAccount && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    Account: {currentAccount.email}
                  </span>
                  {currentAccount.team && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      Team: {currentAccount.team.identifier}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="ipa-file"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    IPA File
                  </label>
                  <div className="rounded-md border-2 border-dashed border-gray-300 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/30">
                    <input
                      id="ipa-file"
                      type="file"
                      accept=".ipa,application/octet-stream"
                      onChange={(event) => {
                        void handleIpaFileChange(event.target.files?.[0] ?? null);
                      }}
                      className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {ipaFile ? `${ipaFile.name}${fileSizeMB ? ` (${fileSizeMB})` : ''}` : 'No file selected'}
                    </p>
                    {ipaMetadataNotice && (
                      <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">{ipaMetadataNotice}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="bundle-id"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Bundle ID
                  </label>
                  <input
                    id="bundle-id"
                    value={bundleId}
                    onChange={(event) => setBundleId(event.target.value)}
                    placeholder="com.example.signedapp"
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="display-name"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Display Name
                  </label>
                  <input
                    id="display-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="My Signed App"
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={!canSign}
                    onClick={() => void handleSign()}
                    className="inline-flex min-w-36 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSigning ? <Spinner /> : 'Start Signing'}
                  </button>
                  {downloadUrl && (
                    <a
                      href={downloadUrl}
                      download={downloadName}
                      className="inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      Download Signed IPA
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Signing Progress</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{progress}%</p>
              </div>
              <ProgressBar progress={progress} />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{progressState}</p>
              <div className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded-md bg-gray-50 p-3 dark:bg-gray-800/50">
                {logs.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No logs yet.</p>
                ) : (
                  logs.map((log) => (
                    <p
                      key={log.id}
                      className="font-mono text-xs leading-5 text-gray-700 dark:text-gray-300"
                    >
                      {log.text}
                    </p>
                  ))
                )}
              </div>
            </div>

            {downloadUrl && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-900/20">
                <p className="text-sm font-medium text-green-700 dark:text-green-300">
                  Signed package is ready
                </p>
                <p className="mt-1 text-xs text-green-700 dark:text-green-300">
                  Use the download button to save{' '}
                  <span className="font-mono">{downloadName}</span> locally.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
