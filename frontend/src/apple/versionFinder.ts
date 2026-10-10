import { parseDownloadResponse, recoverUpdateEndpoint } from './downloadRecovery';
import type { Account, Software } from "../types";
import { appleRequest } from "./request";
import { buildPlist } from "./plist";
import { extractAndMergeCookies } from "./cookies";
import { isRecoverableEmptyResponse, lookupLatestVersion } from './latestVersion';
import i18n from '../i18n';
import {
  RETRYABLE_FAILURE_TYPE,
  redownloadEndpoint,
  volumeStoreEndpoint,
} from "./config";

export async function listVersions(
  account: Account,
  app: Software,
): Promise<{ versions: string[]; updatedCookies: typeof account.cookies }> {
  const deviceId = account.deviceIdentifier;

  let endpoint = volumeStoreEndpoint(account.pod, deviceId);
  let requestHost = endpoint.host;
  let requestPath = endpoint.path;
  let triedRedownload = false;
  let triedUpdate = false;
  let cookies = [...account.cookies];
  let redirectAttempt = 0;
  let externalVersionId: string | undefined;

  while (redirectAttempt <= 3) {
    const payload: Record<string, any> = {
      creditDisplay: "",
      guid: deviceId,
      salableAdamId: app.id,
      serialNumber: '0',
    };
    if (externalVersionId) payload[endpoint.externalVersionIdKey] = externalVersionId;

    const plistBody = buildPlist(payload);

    const headers: Record<string, string> = {
      "Content-Type": "application/x-apple-plist",
      "iCloud-DSID": account.directoryServicesIdentifier,
      "X-Dsid": account.directoryServicesIdentifier,
    };

    const response = await appleRequest({
      method: "POST",
      host: requestHost,
      path: requestPath,
      headers,
      body: plistBody,
      cookies,
    });

    cookies = extractAndMergeCookies(response.rawHeaders, cookies);

    if (response.status === 302) {
      const location = response.headers["location"];
      if (!location) {
        throw new Error("Failed to retrieve redirect location");
      }
      const url = new URL(location);
      requestHost = url.hostname;
      requestPath = url.pathname + url.search;
      redirectAttempt++;
      continue;
    }

    let dict: Record<string, any> | undefined;
    let parseError: unknown;
    try {
      dict = parseDownloadResponse(response, requestHost, requestPath);
    } catch (error) {
      parseError = error;
    }
    if (triedRedownload && !triedUpdate) {
      const update = await recoverUpdateEndpoint(response, dict, deviceId);
      if (update) {
        triedUpdate = true;
        endpoint = update;
        requestHost = endpoint.host;
        requestPath = endpoint.path;
        redirectAttempt = 0;
        continue;
      }
    }
    if (!dict) throw parseError;


    const songList = dict.songList as Record<string, any>[] | undefined;
    if (!Array.isArray(songList) || songList.length === 0) {
      if (!triedRedownload && (String(dict.failureType ?? '') === RETRYABLE_FAILURE_TYPE ||
          isRecoverableEmptyResponse(response.status, dict))) {
        try {
          externalVersionId = await lookupLatestVersion(account, app);
        } catch {
          throw new Error(i18n.t('errors.download.versionLookupFailed'));
        }
        triedRedownload = true;
        endpoint = redownloadEndpoint(deviceId);
        requestHost = endpoint.host;
        requestPath = endpoint.path;
        redirectAttempt = 0;
        continue;
      }
      if (dict.failureType) {
        const failureType = String(dict.failureType);

        switch (failureType) {
          case "2034":
            throw new Error("Password token is expired");
          case "9610":
            throw new Error("License required - purchase the app first");
          default: {
            const msg = dict.customerMessage as string | undefined;
            throw new Error(msg ?? "No items in response");
          }
        }
      }
      throw new Error(dict.customerMessage || i18n.t('errors.download.noItems'));
    }

    const item = songList[0];
    const metadata = item.metadata as Record<string, any>;
    if (!metadata) {
      throw new Error("Missing version identifiers");
    }
    if (triedRedownload && (songList.length !== 1 || String(metadata.itemId) !== String(app.id) ||
        String(metadata.softwareVersionExternalIdentifier) !== externalVersionId ||
        metadata.softwareVersionBundleId !== app.bundleID)) {
      throw new Error(i18n.t('errors.download.unexpectedItem'));
    }

    const identifiers = metadata.softwareVersionExternalIdentifiers as any[];
    if (!identifiers) {
      throw new Error("Missing version identifiers");
    }

    const versions = identifiers.map((id) => String(id)).reverse();
    if (versions.length === 0) {
      throw new Error("No versions found");
    }

    return { versions, updatedCookies: cookies };
  }

  throw new Error("Too many redirects");
}
