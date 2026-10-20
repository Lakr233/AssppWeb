import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inject } from '../src/services/sinfInjector.js';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import os from 'os';
import plist from 'plist';

const TEMP_DIR = path.join(os.tmpdir(), 'sinf-injector-test');

beforeAll(() => {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
});

afterAll(() => {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
});

function createMockIPA(
  bundleName: string,
  opts?: {
    addManifest?: boolean;
    sinfPaths?: string[];
    executableName?: string;
  },
): string {
  const zip = new AdmZip();
  const execName = opts?.executableName ?? bundleName;

  const infoPlistXml = plist.build({
    CFBundleExecutable: execName,
    CFBundleIdentifier: `com.example.${bundleName.toLowerCase()}`,
  });
  zip.addFile(`Payload/${bundleName}.app/Info.plist`, Buffer.from(infoPlistXml));
  zip.addFile(`Payload/${bundleName}.app/${execName}`, Buffer.from('fake executable'));

  if (opts?.addManifest && opts?.sinfPaths) {
    const manifestPlistXml = plist.build({
      SinfPaths: opts.sinfPaths,
    });
    zip.addFile(`Payload/${bundleName}.app/SC_Info/Manifest.plist`, Buffer.from(manifestPlistXml));
  }

  const ipaPath = path.join(TEMP_DIR, `${bundleName}_${Date.now()}.ipa`);
  zip.writeZip(ipaPath);
  return ipaPath;
}

describe('sinfInjector', () => {
  it('should inject sinf via Info.plist fallback (no manifest)', async () => {
    const ipaPath = createMockIPA('TestApp', { executableName: 'TestApp' });
    const sinfData = Buffer.from('fake sinf data for testing').toString('base64');

    await inject([{ id: 1, sinf: sinfData }], ipaPath);

    const resultZip = new AdmZip(ipaPath);
    const sinfEntry = resultZip.getEntry('Payload/TestApp.app/SC_Info/TestApp.sinf');
    expect(sinfEntry).not.toBeNull();

    const sinfContent = resultZip.readFile(sinfEntry!);
    expect(sinfContent).not.toBeNull();
    expect(sinfContent!.toString()).toBe('fake sinf data for testing');
  });

  it('should read bundle name from .app directory', async () => {
    const ipaPath = createMockIPA('MyGreatApp');
    const sinfData = Buffer.from('sinf content').toString('base64');

    await inject([{ id: 1, sinf: sinfData }], ipaPath);

    const resultZip = new AdmZip(ipaPath);
    const sinfEntry = resultZip.getEntry('Payload/MyGreatApp.app/SC_Info/MyGreatApp.sinf');
    expect(sinfEntry).not.toBeNull();
  });

  it('should handle multiple sinfs with manifest', async () => {
    const ipaPath = createMockIPA('MultiSinf', {
      addManifest: true,
      sinfPaths: ['SC_Info/main.sinf', 'SC_Info/extension.sinf'],
    });

    const sinf1 = Buffer.from('sinf data 1').toString('base64');
    const sinf2 = Buffer.from('sinf data 2').toString('base64');

    await inject(
      [
        { id: 1, sinf: sinf1 },
        { id: 2, sinf: sinf2 },
      ],
      ipaPath,
    );

    const resultZip = new AdmZip(ipaPath);

    const entry1 = resultZip.getEntry('Payload/MultiSinf.app/SC_Info/main.sinf');
    expect(entry1).not.toBeNull();
    expect(resultZip.readFile(entry1!)!.toString()).toBe('sinf data 1');

    const entry2 = resultZip.getEntry('Payload/MultiSinf.app/SC_Info/extension.sinf');
    expect(entry2).not.toBeNull();
    expect(resultZip.readFile(entry2!)!.toString()).toBe('sinf data 2');
  });

  it('should handle empty sinfs array with no-manifest fallback', async () => {
    const ipaPath = createMockIPA('EmptyTest');
    await inject([], ipaPath);

    const resultZip = new AdmZip(ipaPath);
    const entries = resultZip.getEntries().filter((e) => e.entryName.endsWith('.sinf'));
    expect(entries.length).toBe(0);
  });

  it('should throw if IPA has no .app directory', async () => {
    const zip = new AdmZip();
    zip.addFile('SomeFile.txt', Buffer.from('not an IPA'));
    const ipaPath = path.join(TEMP_DIR, 'invalid.ipa');
    zip.writeZip(ipaPath);

    const sinfData = Buffer.from('sinf').toString('base64');
    await expect(inject([{ id: 1, sinf: sinfData }], ipaPath)).rejects.toThrow();
  });

  it('should use different executable name from CFBundleExecutable', async () => {
    const ipaPath = createMockIPA('AppBundle', {
      executableName: 'CustomExec',
    });
    const sinfData = Buffer.from('sinf').toString('base64');

    await inject([{ id: 1, sinf: sinfData }], ipaPath);

    const resultZip = new AdmZip(ipaPath);
    // Should use CFBundleExecutable (CustomExec), not bundle name (AppBundle)
    const sinfEntry = resultZip.getEntry('Payload/AppBundle.app/SC_Info/CustomExec.sinf');
    expect(sinfEntry).not.toBeNull();
  });

  it('should prefer manifest over Info.plist when both exist', async () => {
    const ipaPath = createMockIPA('WithManifest', {
      addManifest: true,
      sinfPaths: ['SC_Info/custom.sinf'],
      executableName: 'WithManifest',
    });

    const sinfData = Buffer.from('manifest sinf').toString('base64');
    await inject([{ id: 1, sinf: sinfData }], ipaPath);

    const resultZip = new AdmZip(ipaPath);
    // Should inject at manifest-specified path, not Info.plist path
    const manifestEntry = resultZip.getEntry('Payload/WithManifest.app/SC_Info/custom.sinf');
    expect(manifestEntry).not.toBeNull();
    expect(resultZip.readFile(manifestEntry!)!.toString()).toBe('manifest sinf');
  });
});
