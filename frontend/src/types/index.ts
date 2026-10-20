export interface Software {
  id: number;
  bundleID: string;
  name: string;
  version: string;
  price?: number;
  artistName: string;
  sellerName: string;
  description: string;
  averageUserRating: number;
  userRatingCount: number;
  artworkUrl: string;
  screenshotUrls: string[];
  minimumOsVersion: string;
  fileSizeBytes?: string;
  releaseDate: string;
  releaseNotes?: string;
  formattedPrice?: string;
  primaryGenreName: string;
}

export interface Cookie {
  name: string;
  value: string;
  path: string;
  domain?: string;
  expiresAt?: number;
  httpOnly: boolean;
  secure: boolean;
}

export interface Account {
  email: string;
  password: string;
  appleId: string;
  store: string;
  firstName: string;
  lastName: string;
  passwordToken: string;
  directoryServicesIdentifier: string;
  cookies: Cookie[];
  deviceIdentifier: string;
  pod?: string;
}

export interface Sinf {
  id: number;
  sinf: string; // base64
}

export interface DownloadOutput {
  downloadURL: string;
  sinfs: Sinf[];
  bundleShortVersionString: string;
  bundleVersion: string;
  iTunesMetadata?: string;
}

export interface VersionMetadata {
  displayVersion: string;
  releaseDate: string;
}

export interface DownloadTask {
  id: string;
  software: Software;
  accountHash: string;
  status: 'pending' | 'downloading' | 'paused' | 'injecting' | 'completed' | 'failed';
  progress: number;
  speed: string;
  error?: string;
  hasFile?: boolean;
  createdAt: string;
}

export interface PackageInfo {
  id: string;
  software: Software;
  accountHash: string;
  fileSize: number;
  createdAt: string;
}
