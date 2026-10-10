import { parseDownloadResponse, recoverUpdateEndpoint } from './downloadRecovery';
import type { Account, Software, VersionMetadata } from "../types";
import { appleRequest } from "./request";
import { buildPlist } from "./plist";
import { extractAndMergeCookies } from "./cookies";
import { isRecoverableEmptyResponse } from './latestVersion';
import i18n from '../i18n';
import {
  RETRYABLE_FAILURE_TYPE,
  redownloadEndpoint,
  volumeStoreEndpoint,
} from "./config";

export async function getVersionMetadata(
  account: Account,
  app: Software,
  versionId: string,
): Promise<{
  metadata: VersionMetadata;
  updatedCookies: typeof account.cookies;
}> {
  const deviceId = account.deviceIdentifier;

  let endpoint = volumeStoreEndpoint(account.pod, deviceId);
  let requestHost = endpoint.host;
  let requestPath = endpoint.path;
  let triedRedownload = false;
  let triedUpdate = false;
  let cookies = [...account.cookies];
  let redirectAttempt = 0;

  while (redirectAttempt <= 3) {
    const payload: Record<string, any> = {
      creditDisplay: "",
      guid: deviceId,
      salableAdamId: app.id,
      serialNumber: '0',
      [endpoint.externalVersionIdKey]: versionId,
    };

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


    // volumeStore intermittently returns 5002; retry once via the redownload
    // dispatch endpoint, which serves the same payload.
    if (
      (String(dict.failureType ?? "") === RETRYABLE_FAILURE_TYPE ||
       isRecoverableEmptyResponse(response.status, dict)) &&
      !triedRedownload
    ) {
      triedRedownload = true;
      endpoint = redownloadEndpoint(deviceId);
      requestHost = endpoint.host;
      requestPath = endpoint.path;
      redirectAttempt = 0;
      continue;
    }

    const songList = dict.songList as Record<string, any>[] | undefined;
    if (!Array.isArray(songList) || songList.length === 0) {
      throw new Error(dict.customerMessage || i18n.t('errors.download.noItems'));
    }

    const item = songList[0];
    const itemMetadata = item.metadata as Record<string, any>;
    if (!itemMetadata) {
      throw new Error("Missing metadata");
    }
    if (triedRedownload && (songList.length !== 1 || String(itemMetadata.itemId) !== String(app.id) ||
        String(itemMetadata.softwareVersionExternalIdentifier) !== versionId ||
        itemMetadata.softwareVersionBundleId !== app.bundleID)) {
      throw new Error(i18n.t('errors.download.unexpectedItem'));
    }

    const bundleShortVersionString =
      itemMetadata.bundleShortVersionString as string;
    if (!bundleShortVersionString) {
      throw new Error("Missing bundleShortVersionString");
    }

    const rawReleaseDate = itemMetadata.releaseDate;
    if (!rawReleaseDate) {
      throw new Error("Missing releaseDate");
    }
    const releaseDate =
      rawReleaseDate instanceof Date
        ? rawReleaseDate.toISOString()
        : String(rawReleaseDate);

    return {
      metadata: {
        displayVersion: bundleShortVersionString,
        releaseDate,
      },
      updatedCookies: cookies,
    };
  }

  throw new Error("Too many redirects");
}
