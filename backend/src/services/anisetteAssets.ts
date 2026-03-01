import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

const APPLE_MUSIC_APK_URL =
  "https://apps.mzstatic.com/content/android-apple-music-apk/applemusic.apk";
const APK_DOWNLOAD_TIMEOUT_MS = 60_000;
const SO_ASSET_NAMES = ["libstoreservicescore.so", "libCoreADI.so"] as const;

type SoAssetName = (typeof SO_ASSET_NAMES)[number];

function getAssetPath(baseDir: string, fileName: SoAssetName): string {
  return path.join(baseDir, "anisette", fileName);
}

function hasAllExistingAssets(baseDir: string): boolean {
  return SO_ASSET_NAMES.every((fileName) => {
    const fullPath = getAssetPath(baseDir, fileName);
    try {
      return fs.statSync(fullPath).size > 0;
    } catch {
      return false;
    }
  });
}

async function downloadAppleMusicApk(): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    APK_DOWNLOAD_TIMEOUT_MS,
  );

  try {
    const response = await fetch(APPLE_MUSIC_APK_URL, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to download APK: HTTP ${response.status}`);
    }

    const data = await response.arrayBuffer();
    return Buffer.from(data);
  } finally {
    clearTimeout(timeout);
  }
}

function extractSoAssetsFromApk(apkBuffer: Buffer): Map<SoAssetName, Buffer> {
  const zip = new AdmZip(apkBuffer);
  const output = new Map<SoAssetName, Buffer>();

  for (const fileName of SO_ASSET_NAMES) {
    const entry = zip.getEntry(`lib/arm64-v8a/${fileName}`);
    if (!entry) {
      throw new Error(`Missing ${fileName} in APK`);
    }

    const entryData = entry.getData();
    if (!entryData || entryData.length === 0) {
      throw new Error(`Invalid ${fileName} in APK`);
    }

    output.set(fileName, entryData);
  }

  return output;
}

function writeSoAssets(baseDir: string, assets: Map<SoAssetName, Buffer>) {
  const anisetteDir = path.join(baseDir, "anisette");
  fs.mkdirSync(anisetteDir, { recursive: true });

  for (const fileName of SO_ASSET_NAMES) {
    const data = assets.get(fileName);
    if (!data) {
      throw new Error(`Missing extracted asset ${fileName}`);
    }

    const finalPath = path.join(anisetteDir, fileName);
    const tempPath = `${finalPath}.tmp`;
    fs.writeFileSync(tempPath, data);
    fs.renameSync(tempPath, finalPath);
  }
}

export async function prepareAnisetteAssets(baseDir: string): Promise<void> {
  const existingAssetsAvailable = hasAllExistingAssets(baseDir);

  try {
    console.log("[Anisette] Downloading Apple Music APK...");
    const apkBuffer = await downloadAppleMusicApk();
    const assets = extractSoAssetsFromApk(apkBuffer);
    writeSoAssets(baseDir, assets);
    console.log("[Anisette] Refreshed anisette .so assets.");
  } catch (err) {
    if (existingAssetsAvailable) {
      console.warn(
        `[Anisette] Failed to refresh assets, keeping local files: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }

    throw err;
  }
}
