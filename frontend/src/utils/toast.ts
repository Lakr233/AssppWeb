import type { TFunction } from "i18next";
import { storeIdToCountry } from "../apple/config";
import type { Account } from "../types";

export interface AccountContext {
  userName: string;
  appleId: string;
  countryStr: string;
}

/**
 * Extract display-friendly account context for toast notifications.
 * Centralises the repeated pattern of building userName / appleId / countryStr.
 */
export function getAccountContext(
  account: Account | undefined,
  t: TFunction,
): AccountContext {
  if (!account) {
    return { userName: "Unknown", appleId: "Unknown", countryStr: "Unknown" };
  }
  const userName = `${account.firstName} ${account.lastName}`;
  const appleId = account.email;
  const rawCountryCode = storeIdToCountry(account.store) || "";
  const countryStr = rawCountryCode
    ? t(`countries.${rawCountryCode}`, rawCountryCode)
    : account.store;
  return { userName, appleId, countryStr };
}
