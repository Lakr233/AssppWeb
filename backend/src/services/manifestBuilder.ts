import type { Software } from '../types/index.js';

export function buildManifest(
  software: Software,
  payloadUrl: string,
  displayImageSmallUrl: string,
  displayImageLargeUrl: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>items</key>
    <array>
        <dict>
            <key>assets</key>
            <array>
                <dict>
                    <key>kind</key>
                    <string>software-package</string>
                    <key>url</key>
                    <string>${escapeXml(payloadUrl)}</string>
                </dict>
                <dict>
                    <key>kind</key>
                    <string>display-image</string>
                    <key>url</key>
                    <string>${escapeXml(displayImageSmallUrl)}</string>
                </dict>
                <dict>
                    <key>kind</key>
                    <string>full-size-image</string>
                    <key>url</key>
                    <string>${escapeXml(displayImageLargeUrl)}</string>
                </dict>
            </array>
            <key>metadata</key>
            <dict>
                <key>bundle-identifier</key>
                <string>${escapeXml(software.bundleID)}</string>
                <key>bundle-version</key>
                <string>${escapeXml(software.version)}</string>
                <key>kind</key>
                <string>software</string>
                <key>title</key>
                <string>${escapeXml(software.name)}</string>
            </dict>
        </dict>
    </array>
</dict>
</plist>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Minimal valid 1x1 white PNG (hardcoded)
// This is the smallest valid PNG: 8-byte signature + IHDR + IDAT + IEND
const MINIMAL_WHITE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12P4////DwAJBgMBMHREuwAAAABJRU5ErkJggg==',
  'base64',
);

export function getWhitePng(): Buffer {
  return MINIMAL_WHITE_PNG;
}
