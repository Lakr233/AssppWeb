import i18n from '../i18n';
import { appleRequest } from './request';
import { buildPlist, parsePlist } from './plist';
import { extractAndMergeCookies } from './cookies';
import { fetchBag, defaultAuthURL, normalizeAuthURL } from './bag';
import type { Account, Cookie } from '../types';

export class AuthenticationError extends Error {
  constructor(
    message: string,
    public readonly codeRequired: boolean = false,
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/** A transient auth response that is about to be retried after `delayMs`. */
export interface AuthRetry {
  status: number;
  attempt: number;
  attempts: number;
  delayMs: number;
}

// Apple's auth endpoint answers some requests with a transient status (an
// empty 204, 404, 429 or a 5xx). Like ipatool, replay the request up to three
// times, 10s then 20s apart, honoring a Retry-After of up to 30s. `send`
// rebuilds the request each time, so per-request headers are recomputed.
const AUTH_REQUEST_ATTEMPTS = 3;
const AUTH_RETRY_DELAY_MS = 10_000;
const MAX_AUTH_RETRY_DELAY_MS = 30_000;

function isTransientAuthStatus(status: number): boolean {
  return status === 204 || status === 404 || status === 429 || Math.floor(status / 100) === 5;
}

function retryAfterMs(header: string | undefined): number | undefined {
  const value = header?.trim();
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

type AuthResponse = Awaited<ReturnType<typeof appleRequest>>;

async function sendWithTransientRetry(
  send: () => Promise<AuthResponse>,
  onRetry?: (retry: AuthRetry) => void,
): Promise<AuthResponse> {
  const statuses: number[] = [];
  for (;;) {
    const response = await send();
    if (!isTransientAuthStatus(response.status)) return response;

    statuses.push(response.status);
    if (statuses.length === AUTH_REQUEST_ATTEMPTS) {
      throw new AuthenticationError(
        i18n.t('errors.auth.transientFailure', {
          attempts: AUTH_REQUEST_ATTEMPTS,
          statuses: statuses.join(', '),
        }),
      );
    }

    let delayMs = Math.min(AUTH_RETRY_DELAY_MS * 2 ** (statuses.length - 1), MAX_AUTH_RETRY_DELAY_MS);
    const requested = retryAfterMs(response.headers['retry-after']);
    if (requested !== undefined) {
      if (requested > MAX_AUTH_RETRY_DELAY_MS) {
        throw new AuthenticationError(
          i18n.t('errors.auth.retryLater', {
            seconds: Math.ceil(requested / 1000),
          }),
        );
      }
      delayMs = Math.max(requested, 1000);
    }

    onRetry?.({
      status: response.status,
      attempt: statuses.length + 1,
      attempts: AUTH_REQUEST_ATTEMPTS,
      delayMs,
    });
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

export async function authenticate(
  email: string,
  password: string,
  code?: string,
  existingCookies?: Cookie[],
  deviceId: string = '',
  onRetry?: (retry: AuthRetry) => void,
): Promise<Account> {
  let cookies: Cookie[] = existingCookies ? [...existingCookies] : [];
  let storeFront = '';
  let lastError: Error | null = null;

  const defaultAuthEndpoint = new URL(defaultAuthURL);
  defaultAuthEndpoint.searchParams.set('guid', deviceId);
  let requestHost = defaultAuthEndpoint.hostname;
  let requestPath = `${defaultAuthEndpoint.pathname}${defaultAuthEndpoint.search}`;

  const bag = await fetchBag(deviceId);
  const authEndpoint = new URL(normalizeAuthURL(bag.authURL));
  authEndpoint.searchParams.set('guid', deviceId);
  requestHost = authEndpoint.hostname;
  requestPath = `${authEndpoint.pathname}${authEndpoint.search}`;

  let currentAttempt = 0;
  let redirectAttempt = 0;

  while (currentAttempt < 2 && redirectAttempt <= 3) {
    currentAttempt++;

    try {
      const body: Record<string, string> = {
        appleId: email,
        attempt: code ? '2' : '4',
        guid: deviceId,
        password: code ? `${password}${code}` : password,
        rmp: '0',
        why: 'signIn',
      };

      const plistBody = buildPlist(body);

      const response = await sendWithTransientRetry(async () => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/x-apple-plist',
        };

        const sent = await appleRequest({
          method: 'POST',
          host: requestHost,
          path: requestPath,
          headers,
          body: plistBody,
          cookies,
        });
        cookies = extractAndMergeCookies(sent.rawHeaders, cookies);
        return sent;
      }, onRetry);

      // Read store front
      const storeHeader = response.headers['x-set-apple-store-front'];
      if (storeHeader) {
        const parts = storeHeader.split('-');
        if (parts[0]) {
          storeFront = parts[0];
        }
      }

      // Read pod
      const podHeader = response.headers['pod'];
      const pod = podHeader || undefined;

      // Handle redirect. The native /fast auth host can answer with 301 as
      // well as the usual 302, so follow the full set of redirect statuses.
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers['location'];
        if (!location) {
          throw new Error(i18n.t('errors.auth.redirectLocation'));
        }
        const redirectURL = new URL(location, `https://${requestHost}${requestPath}`);
        const url = new URL(normalizeAuthURL(redirectURL.toString()));
        requestHost = url.hostname;
        requestPath = url.pathname + url.search;
        currentAttempt--;
        redirectAttempt++;
        continue;
      }

      // Handle non-plist responses (e.g. 403 with empty body)
      if (!response.body.trim()) {
        throw new Error(i18n.t('errors.auth.emptyBody', { status: response.status }));
      }

      const dict = parsePlist(response.body) as Record<string, any>;

      // Check for 2FA requirement
      if (dict.failureType === '' && !code && dict.customerMessage === 'MZFinance.BadLogin.Configurator_message') {
        throw new AuthenticationError(i18n.t('errors.auth.requiresVerification'), true);
      }

      const failureMessage = (dict.dialog as Record<string, any>)?.explanation ?? dict.customerMessage;

      const accountInfo = dict.accountInfo as Record<string, any>;
      if (!accountInfo) {
        throw new Error(failureMessage ?? i18n.t('errors.auth.missingAccountInfo'));
      }

      const address = accountInfo.address as Record<string, any>;
      if (!address) {
        throw new Error(failureMessage ?? i18n.t('errors.auth.missingAddress'));
      }

      const account: Account = {
        email,
        password,
        appleId: (accountInfo.appleId as string) ?? '',
        store: storeFront,
        firstName: (address.firstName as string) ?? '',
        lastName: (address.lastName as string) ?? '',
        passwordToken: (dict.passwordToken as string) ?? '',
        directoryServicesIdentifier: String(dict.dsPersonId ?? ''),
        cookies,
        deviceIdentifier: deviceId,
        pod,
      };

      return account;
    } catch (e) {
      if (e instanceof AuthenticationError) throw e;
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastError ?? new Error(i18n.t('errors.auth.unknownReason'));
}
