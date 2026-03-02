import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageContainer from '../Layout/PageContainer';
import Alert from '../common/Alert';
import Spinner from '../common/Spinner';
import { SigningIcon } from '../common/icons';
import { useSigningStore } from '../../store/signing';
import { authenticate } from '../../apple/auth';
import { provisionAnisette, getAnisetteData } from '../../apple/anisetteService';
import { fetchTeam, fetchCertificates, fetchDevices } from '../../apple/developerApi';
import type { VerificationHandler } from '../../apple/auth';

export default function SigningLogin() {
  const { t } = useTranslation();
  const { addAccount, setAnisetteData, setIsProvisioned, isProvisioned } = useSigningStore();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [submitCode, setSubmitCode] = useState<((code: string) => Promise<void>) | null>(null);
  const [code, setCode] = useState('');

  const currentStep = !isProvisioned ? 1 : needs2FA ? 3 : 2;
  const canSubmitLogin = !loading && email.trim().length > 0 && password.trim().length > 0;
  const canSubmit2FA = !loading && code.length === 6;
  const setupSteps = [
    { step: 1, title: t('signing.login.stepDevice') },
    { step: 2, title: t('signing.login.stepSignIn') },
    { step: 3, title: t('signing.login.step2FA') },
  ];

  const handleProvision = async () => {
    setLoading(true);
    setError(null);
    try {
      await provisionAnisette();
      const data = await getAnisetteData();
      setAnisetteData(data);
      setIsProvisioned(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('signing.login.errorProvision'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError(t('signing.login.errorEmailPassword'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const anisetteData = await getAnisetteData();

      const verificationHandler: VerificationHandler = (submit) => {
        setNeeds2FA(true);
        setSubmitCode(() => submit);
        setLoading(false);
      };

      const { account, session } = await authenticate(
        email.trim(),
        password,
        anisetteData,
        verificationHandler
      );

      const team = await fetchTeam(session);
      const certificates = await fetchCertificates(session, team);
      const devices = await fetchDevices(session, team);

      addAccount({
        id: account.identifier,
        email: account.email,
        session,
        account,
        team,
        certificates,
        devices,
      });

      setEmail('');
      setPassword('');
      setNeeds2FA(false);
      setSubmitCode(null);
      setCode('');
      navigate('/signing/accounts');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('signing.login.errorLogin'));
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async () => {
    if (!submitCode || !code.trim()) return;

    setError(null);
    setLoading(true);
    try {
      await submitCode(code.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('signing.login.errorCode'));
      setLoading(false);
    }
  };

  const handleCodeChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '').slice(0, 6);
    setCode(digitsOnly);
  };

  return (
    <PageContainer title={t('signing.login.title')}>
      <div className="mx-auto max-w-lg space-y-6">
        {error && (
          <Alert type="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
              <SigningIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {t('signing.login.workspaceTitle')}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {t('signing.login.workspaceDesc')}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-900 dark:text-white">{t('signing.login.setupProgress')}</h2>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {t('signing.login.stepOf', { current: currentStep, total: 3 })}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {setupSteps.map((item) => {
              const isActive = currentStep === item.step;
              const isDone = currentStep > item.step;
              return (
                <div
                  key={item.step}
                  className={`rounded-md border px-3 py-2 ${
                    isActive
                      ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                      : isDone
                        ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300'
                        : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px]">
                      {isDone ? '\u2713' : item.step}
                    </span>
                    <p className="text-xs font-medium">{item.title}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {!isProvisioned && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-2 text-lg font-medium text-gray-900 dark:text-white">
              {t('signing.login.setupDevice')}
            </h2>
            <p className="mb-5 text-sm text-gray-600 dark:text-gray-400">
              {t('signing.login.setupDesc')}
            </p>
            <button
              onClick={handleProvision}
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Spinner /> : t('signing.login.setupBtn')}
            </button>
          </div>
        )}

        {isProvisioned && !needs2FA && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-900 dark:bg-green-900/20 dark:text-green-300">
              {t('signing.login.deviceReady')}
            </div>
            <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">{t('signing.login.signIn')}</h2>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void handleLogin();
              }}
            >
              <div>
                <label
                  htmlFor="email"
                  className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {t('signing.login.appleId')}
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {t('signing.login.password')}
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  disabled={!canSubmitLogin}
                  className="inline-flex min-w-28 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? <Spinner /> : t('signing.login.signIn')}
                </button>
              </div>
            </form>
          </div>
        )}

        {needs2FA && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-2 text-lg font-medium text-gray-900 dark:text-white">
              {t('signing.login.twoFactor')}
            </h2>
            <p className="mb-5 text-sm text-gray-600 dark:text-gray-400">
              {t('signing.login.twoFactorDesc')}
            </p>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void handle2FASubmit();
              }}
            >
              <input
                type="text"
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-center text-2xl tracking-[0.35em] text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="000000"
              />
              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  disabled={!canSubmit2FA}
                  className="inline-flex min-w-28 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? <Spinner /> : t('signing.login.verify')}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
