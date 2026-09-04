/// <reference types="vite/client" />

import type { DownloadTask } from '../../types';

const previewTaskIdPrefix = 'preview-download-';

const devPreviewDownloadTasks: DownloadTask[] = [
  {
    id: `${previewTaskIdPrefix}completed`,
    software: {
      id: 900000001,
      bundleID: 'invalid.asspp.focusboard',
      name: 'Focusboard',
      version: '4.8.2',
      price: 0,
      artistName: 'Northstar Tools',
      sellerName: 'Northstar Tools, Inc.',
      description:
        'A focused workspace for planning releases, tracking builds, and keeping technical projects moving.',
      averageUserRating: 4.8,
      userRatingCount: 2841,
      artworkUrl: 'https://assets.asspp.invalid/focusboard.png',
      screenshotUrls: [],
      minimumOsVersion: '16.0',
      fileSizeBytes: '187695104',
      releaseDate: '2026-07-18T09:30:00Z',
      releaseNotes: 'Improves timeline performance and adds build annotations.',
      formattedPrice: 'Free',
      primaryGenreName: 'Productivity',
    },
    accountHash: 'preview-user@asspp.invalid',
    status: 'completed',
    progress: 100,
    speed: '',
    hasFile: true,
    createdAt: '2026-08-01T14:32:00Z',
  },
  {
    id: `${previewTaskIdPrefix}downloading`,
    software: {
      id: 900000002,
      bundleID: 'invalid.asspp.packetlens',
      name: 'Packet Lens',
      version: '2.6.0',
      price: 4.99,
      artistName: 'Signal Foundry',
      sellerName: 'Signal Foundry Labs',
      description:
        'Inspect local network activity with clear timelines and developer-friendly diagnostics.',
      averageUserRating: 4.6,
      userRatingCount: 916,
      artworkUrl: 'https://assets.asspp.invalid/packet-lens.png',
      screenshotUrls: [],
      minimumOsVersion: '17.0',
      fileSizeBytes: '324743168',
      releaseDate: '2026-07-27T16:10:00Z',
      releaseNotes: 'Adds live filters and improves large capture handling.',
      formattedPrice: '$4.99',
      primaryGenreName: 'Developer Tools',
    },
    accountHash: 'preview-user@asspp.invalid',
    status: 'downloading',
    progress: 63,
    speed: '18.4 MB/s',
    hasFile: false,
    createdAt: '2026-08-02T08:42:00Z',
  },
  {
    id: `${previewTaskIdPrefix}paused`,
    software: {
      id: 900000003,
      bundleID: 'invalid.asspp.auroranotes',
      name: 'Aurora Notes',
      version: '7.1.3',
      price: 0,
      artistName: 'Lumen Works',
      sellerName: 'Lumen Works Studio',
      description:
        'A quiet Markdown notebook with offline workspaces and encrypted project archives.',
      averageUserRating: 4.7,
      userRatingCount: 5320,
      artworkUrl: 'https://assets.asspp.invalid/aurora-notes.png',
      screenshotUrls: [],
      minimumOsVersion: '15.0',
      fileSizeBytes: '98251520',
      releaseDate: '2026-06-30T11:00:00Z',
      releaseNotes: 'Refines document search and workspace navigation.',
      formattedPrice: 'Free',
      primaryGenreName: 'Utilities',
    },
    accountHash: 'preview-user@asspp.invalid',
    status: 'paused',
    progress: 38,
    speed: '',
    hasFile: false,
    createdAt: '2026-08-01T22:15:00Z',
  },
  {
    id: `${previewTaskIdPrefix}failed`,
    software: {
      id: 900000004,
      bundleID: 'invalid.asspp.buildrelay',
      name: 'Build Relay',
      version: '1.9.5',
      price: 1.99,
      artistName: 'Terminal Nine',
      sellerName: 'Terminal Nine Software',
      description:
        'Monitor build pipelines, review artifacts, and receive concise deployment summaries.',
      averageUserRating: 4.4,
      userRatingCount: 407,
      artworkUrl: 'https://assets.asspp.invalid/build-relay.png',
      screenshotUrls: [],
      minimumOsVersion: '16.4',
      fileSizeBytes: '145752064',
      releaseDate: '2026-07-09T07:45:00Z',
      releaseNotes: 'Adds artifact retention controls and clearer failure summaries.',
      formattedPrice: '$1.99',
      primaryGenreName: 'Developer Tools',
    },
    accountHash: 'preview-user@asspp.invalid',
    status: 'failed',
    progress: 21,
    speed: '',
    error: 'Preview CDN connection timed out. No package data was changed.',
    hasFile: false,
    createdAt: '2026-07-31T19:08:00Z',
  },
];

export const previewDownloadTasks = import.meta.env.DEV
  ? devPreviewDownloadTasks
  : [];

export function isDownloadPreviewEnabled(search: string): boolean {
  if (!import.meta.env.DEV) return false;

  return new URLSearchParams(search).get('preview') === 'downloads';
}

export function isPreviewDownloadTask(task: DownloadTask): boolean {
  if (!import.meta.env.DEV) return false;

  return task.id.startsWith(previewTaskIdPrefix);
}
