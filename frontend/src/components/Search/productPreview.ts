/// <reference types="vite/client" />

import type { Account, Software } from '../../types';

const previewApp: Software = {
  id: 990000001,
  bundleID: 'invalid.asspp.signalcanvas',
  name: 'Signal Canvas',
  version: '3.4.1',
  price: 0,
  artistName: 'Copperline Studio',
  sellerName: 'Copperline Studio, Inc.',
  description:
    'A focused visual workspace for mapping systems, annotating releases, and sharing technical ideas with your team.',
  averageUserRating: 4.8,
  userRatingCount: 1842,
  artworkUrl: '',
  screenshotUrls: [],
  minimumOsVersion: '16.0',
  fileSizeBytes: '176160768',
  releaseDate: '2026-07-24T10:30:00Z',
  releaseNotes:
    'Adds reusable system blocks, faster canvas search, and clearer export previews.',
  formattedPrice: 'Free',
  primaryGenreName: 'Developer Tools',
};

const previewAccounts: Account[] = [
  {
    email: 'developer@preview.asspp.invalid',
    password: 'preview-password.invalid',
    appleId: 'preview-apple-id.invalid',
    store: '143441',
    firstName: 'Avery',
    lastName: 'Chen',
    passwordToken: 'preview-token.invalid',
    directoryServicesIdentifier: 'preview-dsid.invalid',
    cookies: [],
    deviceIdentifier: 'DEADBEEFCAFE',
    pod: 'preview',
  },
];

export const previewProductApp: Software | null = import.meta.env.DEV
  ? previewApp
  : null;

export const previewProductAccounts: Account[] = import.meta.env.DEV
  ? previewAccounts
  : [];

export function isProductPreviewEnabled(search: string): boolean {
  if (!import.meta.env.DEV) return false;

  return new URLSearchParams(search).get('preview') === 'product';
}
