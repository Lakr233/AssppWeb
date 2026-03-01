import { getAppleApi } from './altSignClient';
import type { AppleAPISession } from './auth';
import type {
  AppGroup,
  AppID,
  Certificate,
  Device,
  ProvisioningProfile,
  Team,
} from './developerTypes';

export async function fetchTeams(session: AppleAPISession): Promise<Team[]> {
  return getAppleApi().fetchTeams(session);
}

export async function fetchTeam(session: AppleAPISession): Promise<Team> {
  return getAppleApi().fetchTeam(session);
}

export async function fetchDevices(
  session: AppleAPISession,
  team: Team
): Promise<Device[]> {
  return getAppleApi().fetchDevices(session, team);
}

export async function registerDevice(
  session: AppleAPISession,
  team: Team,
  name: string,
  identifier: string
): Promise<Device> {
  return getAppleApi().registerDevice(session, team, name, identifier);
}

export async function fetchCertificates(
  session: AppleAPISession,
  team: Team
): Promise<Certificate[]> {
  return getAppleApi().fetchCertificates(session, team);
}

export async function addCertificate(
  session: AppleAPISession,
  team: Team,
  machineName: string
): Promise<{ certificate: Certificate; privateKey: Uint8Array }> {
  return getAppleApi().addCertificate(session, team, machineName);
}

export async function revokeCertificate(
  session: AppleAPISession,
  team: Team,
  certificate: Certificate
): Promise<boolean> {
  return getAppleApi().revokeCertificate(session, team, certificate);
}

export async function fetchAppIDs(
  session: AppleAPISession,
  team: Team
): Promise<AppID[]> {
  return getAppleApi().fetchAppIDs(session, team);
}

export async function addAppID(
  session: AppleAPISession,
  team: Team,
  name: string,
  bundleIdentifier: string
): Promise<AppID> {
  return getAppleApi().addAppID(session, team, name, bundleIdentifier);
}

export async function fetchAppGroups(
  session: AppleAPISession,
  team: Team
): Promise<AppGroup[]> {
  return getAppleApi().fetchAppGroups(session, team);
}

export async function fetchProvisioningProfile(
  session: AppleAPISession,
  team: Team,
  appID: AppID
): Promise<ProvisioningProfile> {
  return getAppleApi().fetchProvisioningProfile(session, team, appID);
}
