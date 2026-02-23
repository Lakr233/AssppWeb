import type { Account, Software } from "../types";
import { appleRequest } from "./request";
import { buildPlist, parsePlist } from "./plist";
import { extractAndMergeCookies } from "./cookies";
import { storeAPIHost } from "./config";

export async function listVersions(
  account: Account,
  app: Software,
): Promise<{ versions: string[]; updatedCookies: typeof account.cookies }> {
  const deviceId = account.deviceIdentifier;

  let requestHost = storeAPIHost(account.pod);
  let requestPath = `/WebObjects/MZFinance.woa/wa/volumeStoreDownloadProduct?guid=${deviceId}`;
  let cookies = [...account.cookies];
  let redirectAttempt = 0;

  while (redirectAttempt <= 3) {
    const payload: Record<string, any> = {
      creditDisplay: "",
      guid: deviceId,
      salableAdamId: app.id,
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

    const dict = parsePlist(response.body) as Record<string, any>;

    const songList = dict.songList as Record<string, any>[] | undefined;
    if (!songList || songList.length === 0) {
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
      throw new Error("No items in response");
    }

    const item = songList[0];
    const metadata = item.metadata as Record<string, any>;
    if (!metadata) {
      throw new Error("Missing version identifiers");
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
