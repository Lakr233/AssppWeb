import type {
  Account,
  AnisetteData,
  AppleAPISession,
  VerificationHandler as AltSignVerificationHandler,
} from 'altsign.js';
import { getAppleApi } from './altSignClient';

export type { Account, AppleAPISession };

export type VerificationHandler = (submitCode: (code: string) => Promise<void>) => void;

function adaptVerificationHandler(
  handler?: VerificationHandler
): AltSignVerificationHandler | undefined {
  if (!handler) {
    return undefined;
  }

  return (submitCode) => {
    handler(submitCode as (code: string) => Promise<void>);
  };
}

export async function authenticate(
  appleID: string,
  password: string,
  anisetteData: AnisetteData,
  verificationHandler?: VerificationHandler
): Promise<{ account: Account; session: AppleAPISession }> {
  return getAppleApi().authenticate(
    appleID,
    password,
    anisetteData,
    adaptVerificationHandler(verificationHandler)
  );
}
