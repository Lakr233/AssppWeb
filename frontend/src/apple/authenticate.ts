import i18n from '../i18n';
import { appleRequest } from './request';
import { buildPlist, parsePlist } from './plist';
import { extractAndMergeCookies } from './cookies';
import { fetchBag, normalizeAuthURL, defaultAuthURL } from './bag';
import { connectSAP } from './sap';
import { toBase64 } from './sap/bytes';
import type { SAPSigner } from './sap/signer';
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

// Apple's edge sheds load on this route: fifteen identical POSTs to the legacy
// endpoint, measured from a clean residential network, came back 503 204 403
// 403 403 204 404 403 500 403 301 301 503 404 403, and only the 403s carried
// the headers that prove MZFinance itself answered. A bogus path on the same
// host answered a stable 404 throughout, and the bag host a stable 200, so the
// shedding is per route rather than per request or per client.
//
// Reaching the service about 40% of the time means three attempts miss it
// outright 22% of the time; eight miss 2%. The refusals come back in
// milliseconds, so they are retried 2s apart rather than backing off — there
// is no overload to wait out, only another draw to take. A Retry-After is
// still honored, up to 30s. `send` rebuilds the request each time, so
// per-request headers are recomputed.
const AUTH_REQUEST_ATTEMPTS = 8;
const AUTH_RETRY_DELAY_MS = 2_000;
const MAX_AUTH_RETRY_DELAY_MS = 30_000;

// Apple's own services stamp these. Their absence means the response came from
// the edge, so the request never reached the service that checks credentials —
// a different problem from a service that answered badly, and different advice.
const SERVICE_HEADERS = ['apple-originating-system', 'x-apple-jingle-correlation-key', 'x-responding-instance'];

// Logged behind an empty refusal. A 204 carries no body and no failure code,
// so the response headers are the only evidence of which Apple service
// answered and whether the request reached the credential check at all. They
// travel inside the wisp tunnel, so they cannot be read from devtools.
const LOGGED_HEADERS = [
  ...SERVICE_HEADERS,
  'x-apple-request-uuid',
  'apple-timing-app',
  'apple-seq',
  'apple-tk',
  'content-type',
  'content-length',
  'location',
  'pod',
  'x-set-apple-store-front',
  'retry-after',
  'www-authenticate',
];

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
  rotate?: () => void,
): Promise<AuthResponse> {
  const statuses: number[] = [];
  let reachedService = false;
  for (;;) {
    const response = await send();
    if (!isTransientAuthStatus(response.status)) return response;

    if (SERVICE_HEADERS.some((name) => response.headers[name])) reachedService = true;
    statuses.push(response.status);

    console.warn(
      `[Auth] HTTP ${response.status}`,
      Object.fromEntries(
        LOGGED_HEADERS.map((name) => [name, response.headers[name]]).filter(([, value]) => value !== undefined),
      ),
    );

    if (statuses.length === AUTH_REQUEST_ATTEMPTS) {
      throw new AuthenticationError(
        i18n.t(reachedService ? 'errors.auth.transientFailure' : 'errors.auth.edgeRefused', {
          attempts: AUTH_REQUEST_ATTEMPTS,
          statuses: statuses.join(', '),
        }),
      );
    }

    let delayMs = AUTH_RETRY_DELAY_MS;
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
    // The next draw goes to a different endpoint, since the shedding is per
    // route. Replaying one endpoint would draw from the same pool again.
    rotate?.();
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

function approvedAuthEndpoint(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !/^(?:auth|buy|p\d+-buy)\.itunes\.apple\.com$/.test(url.hostname)
  ) {
    throw new Error('Authentication requires an approved Apple HTTPS endpoint');
  }
  return url;
}

interface AuthEndpoint {
  host: string;
  path: string;
}

// The legacy endpoint, which is what the live bag advertises today. Kept as a
// constant because it is also a rotation target when the bag points elsewhere.
const LEGACY_AUTH_URL = 'https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/authenticate';

// Candidates for the rotation, in the order they are tried: what the bag
// advertises, then the legacy endpoint, then the native one, deduplicated.
// Today the bag returns the legacy endpoint, so this is two distinct targets.
//
// Every candidate is in Apple's SAP-signed list and takes the same body, and a
// signature covers the body alone, so one signature serves all of them.
// ipatool#513 reports the legacy endpoint answering 302 to a pod host where
// reposting the body returns 200, which the redirect handling already follows.
function authEndpoints(bagURL: string, deviceId: string): AuthEndpoint[] {
  const endpoints: AuthEndpoint[] = [];
  const seen = new Set<string>();

  // The bag URL is checked, not skipped: a bag pointing somewhere unapproved
  // fails the sign-in rather than quietly falling back to a default.
  for (const candidate of [bagURL, LEGACY_AUTH_URL, defaultAuthURL]) {
    const url = approvedAuthEndpoint(normalizeAuthURL(candidate));
    url.searchParams.set('guid', deviceId);
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    endpoints.push({ host: url.hostname, path: url.pathname + url.search });
  }

  return endpoints;
}

interface AuthSession {
  signer: SAPSigner;
  cookies: Cookie[];
  storeFront: string;
  endpoints: AuthEndpoint[];
  requestHost: string;
  requestPath: string;
  pod?: string;
}

/** Retain this instance when continuing with a verification code. */
export class Authenticator {
  private session?: AuthSession;
  private busy = false;

  constructor(
    private readonly deviceId: string,
    private readonly existingCookies: Cookie[] = [],
    // Apple only sends the storefront and pod headers on some responses, and
    // the account returned here replaces the stored one wholesale. Without the
    // previous values to fall back on, a renewal that omits them blanks
    // account.store — which every region filter reads, so the account vanishes
    // from the app — and drops the pod, sending later calls to the wrong host.
    private readonly previous?: Pick<Account, 'store' | 'pod'>,
  ) {}

  private async connect(): Promise<AuthSession> {
    const bag = await fetchBag(this.deviceId);
    const endpoints = authEndpoints(bag.authURL, this.deviceId);
    const signer = await connectSAP();
    return {
      signer,
      cookies: [...this.existingCookies],
      storeFront: this.previous?.store ?? '',
      pod: this.previous?.pod,
      endpoints,
      requestHost: endpoints[0].host,
      requestPath: endpoints[0].path,
    };
  }

  async authenticate(
    email: string,
    password: string,
    code?: string,
    onRetry?: (retry: AuthRetry) => void,
  ): Promise<Account> {
    if (this.busy) throw new Error('An authentication request is already in progress');
    this.busy = true;
    try {
      const session = (this.session ??= await this.connect());
      let { cookies, storeFront, requestHost, requestPath, pod } = session;
      const endpoints = session.endpoints;
      let endpointIndex = 0;
      const deviceId = this.deviceId;
      let lastError: Error | null = null;
      try {
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

            const response = await sendWithTransientRetry(
              async () => {
                const headers: Record<string, string> = {
                  'Content-Type': 'application/x-apple-plist',
                  'X-Apple-ActionSignature': toBase64(await session.signer.sign(new TextEncoder().encode(plistBody))),
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
              },
              onRetry,
              () => {
                endpointIndex = (endpointIndex + 1) % endpoints.length;
                requestHost = endpoints[endpointIndex].host;
                requestPath = endpoints[endpointIndex].path;
              },
            );

            // Read store front
            const storeHeader = response.headers['x-set-apple-store-front'];
            if (storeHeader) {
              const parts = storeHeader.split('-');
              if (parts[0]) {
                storeFront = parts[0];
              }
            }

            // Read pod
            pod = response.headers['pod'] || pod;

            // Handle redirect. The native /fast auth host can answer with 301 as
            // well as the usual 302, so follow the full set of redirect statuses.
            if ([301, 302, 303, 307, 308].includes(response.status)) {
              const location = response.headers['location'];
              if (!location) {
                throw new Error(i18n.t('errors.auth.redirectLocation'));
              }
              const redirectURL = new URL(location, `https://${requestHost}${requestPath}`);
              const url = approvedAuthEndpoint(normalizeAuthURL(redirectURL.toString()));
              requestHost = url.hostname;
              requestPath = url.pathname + url.search;
              currentAttempt--;
              redirectAttempt++;
              continue;
            }

            if (response.status !== 200) throw new Error(`Authentication failed (HTTP ${response.status})`);

            // Handle non-plist responses (e.g. 403 with empty body)
            if (!response.body.trim()) {
              throw new Error(i18n.t('errors.auth.emptyBody', { status: response.status }));
            }

            const dict = parsePlist(response.body) as Record<string, any>;

            // Check for 2FA requirement
            if (
              dict.failureType === '' &&
              !code &&
              dict.customerMessage === 'MZFinance.BadLogin.Configurator_message'
            ) {
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
      } finally {
        Object.assign(session, { cookies, storeFront, requestHost, requestPath, pod });
      }
    } finally {
      this.busy = false;
    }
  }
}

export async function authenticate(
  email: string,
  password: string,
  code?: string,
  existingCookies?: Cookie[],
  deviceId: string = '',
  onRetry?: (retry: AuthRetry) => void,
  previous?: Pick<Account, 'store' | 'pod'>,
): Promise<Account> {
  return new Authenticator(deviceId, existingCookies, previous).authenticate(email, password, code, onRetry);
}
