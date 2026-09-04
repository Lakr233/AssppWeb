import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PackageQuickActions from '../../src/components/Download/PackageQuickActions';
import { previewDownloadTasks } from '../../src/components/Download/previewTasks';
import { useToastStore } from '../../src/store/toast';
import type { DownloadTask } from '../../src/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  'clipboard',
);
const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');
const originalCreateObjectURL = Object.getOwnPropertyDescriptor(
  URL,
  'createObjectURL',
);
const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(
  URL,
  'revokeObjectURL',
);

function createTask(
  overrides: Partial<DownloadTask> = {},
): DownloadTask {
  return {
    id: 'real-download-task',
    software: {
      id: 123,
      bundleID: 'com.example.utility',
      name: 'Utility/App',
      version: '3.4.5',
      artistName: 'Example Developer',
      sellerName: 'Example Developer LLC',
      description: 'A test application.',
      averageUserRating: 4.8,
      userRatingCount: 42,
      artworkUrl: '',
      screenshotUrls: [],
      minimumOsVersion: '16.0',
      fileSizeBytes: '5242880',
      releaseDate: '2026-08-01T00:00:00Z',
      primaryGenreName: 'Utilities',
    },
    accountHash: 'account-hash-123',
    status: 'completed',
    progress: 100,
    speed: '',
    hasFile: true,
    createdAt: '2026-08-02T00:00:00Z',
    ...overrides,
  };
}

function restoreProperty(
  target: object,
  key: PropertyKey,
  descriptor?: PropertyDescriptor,
) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }

  Reflect.deleteProperty(target, key);
}

describe('PackageQuickActions', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    restoreProperty(navigator, 'clipboard', originalClipboard);
    restoreProperty(navigator, 'share', originalShare);
    restoreProperty(URL, 'createObjectURL', originalCreateObjectURL);
    restoreProperty(URL, 'revokeObjectURL', originalRevokeObjectURL);
    useToastStore.setState({ toasts: [] });
  });

  it('shows install, share, and download for a completed package with a file', () => {
    render(<PackageQuickActions task={createTask()} />);

    expect(screen.getByTestId('package-quick-actions')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'downloads.package.install' }),
    ).toHaveAttribute('href', expect.stringMatching(/^itms-services:\/\//));
    expect(
      screen.getByRole('button', { name: 'downloads.package.share' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'downloads.package.downloadIpa' }),
    ).toBeInTheDocument();
  });

  it('does not show quick actions when a completed task has no file', () => {
    render(
      <PackageQuickActions task={createTask({ hasFile: false })} />,
    );

    expect(screen.queryByTestId('package-quick-actions')).not.toBeInTheDocument();
  });

  it.each<DownloadTask['status']>([
    'pending',
    'downloading',
    'paused',
    'injecting',
    'failed',
  ])('does not show quick actions for a %s task', (status) => {
    render(<PackageQuickActions task={createTask({ status })} />);

    expect(screen.queryByTestId('package-quick-actions')).not.toBeInTheDocument();
  });

  it('keeps all preview actions local and shows a notice for each click', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    const nativeShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: nativeShare,
    });

    render(<PackageQuickActions task={previewDownloadTasks[0]} />);

    await user.click(
      screen.getByRole('link', { name: 'downloads.package.install' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'downloads.package.share' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'downloads.package.downloadIpa' }),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(clipboardWrite).not.toHaveBeenCalled();
    expect(nativeShare).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts).toHaveLength(3);
    expect(useToastStore.getState().toasts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'downloads.preview.actionHint',
          title: 'downloads.preview.badge',
          type: 'info',
        }),
      ]),
    );
  });

  it('downloads a real package through the authenticated API as a blob', async () => {
    const user = userEvent.setup();
    const ipaBlob = new Blob(['ipa contents'], {
      type: 'application/octet-stream',
    });
    const responseBlob = vi.fn().mockResolvedValue(ipaBlob);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      blob: responseBlob,
    } as Response);
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-ipa');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    let clickedAnchor: HTMLAnchorElement | undefined;
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function captureAnchor(this: HTMLAnchorElement) {
        clickedAnchor = this;
      });
    sessionStorage.setItem('auth-token', 'test-access-token');

    render(<PackageQuickActions task={createTask()} />);
    await user.click(
      screen.getByRole('button', { name: 'downloads.package.downloadIpa' }),
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/packages/real-download-task/file?accountHash=account-hash-123',
        { headers: { 'X-Access-Token': 'test-access-token' } },
      );
      expect(anchorClick).toHaveBeenCalledOnce();
    });
    expect(responseBlob).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledWith(ipaBlob);
    expect(clickedAnchor?.href).toBe('blob:mock-ipa');
    expect(clickedAnchor?.download).toBe('Utility-App_3.4.5.ipa');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-ipa');
  });
});
