import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import type { AnisetteData } from '../apple/anisetteService';
import type { AppleAPISession, Account } from '../apple/auth';
import type { Team, Certificate, Device } from '../apple/developerTypes';

const ACCOUNTS_STORAGE_KEY = 'asspp-accounts';
const SIGNING_STORAGE_ENTRY = 'signing-storage';
const LEGACY_SIGNING_STORAGE_KEY = 'signing-storage';

function parseAccountsStorage(raw: string | null): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

const accountsLocalStorage: StateStorage = {
  getItem: (name) => {
    const entries = parseAccountsStorage(localStorage.getItem(ACCOUNTS_STORAGE_KEY));
    const existingValue = entries[name];
    if (typeof existingValue === 'string') {
      return existingValue;
    }

    const legacyValue = localStorage.getItem(LEGACY_SIGNING_STORAGE_KEY);
    if (!legacyValue) {
      return null;
    }

    entries[name] = legacyValue;
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(entries));
    localStorage.removeItem(LEGACY_SIGNING_STORAGE_KEY);
    return legacyValue;
  },
  setItem: (name, value) => {
    const entries = parseAccountsStorage(localStorage.getItem(ACCOUNTS_STORAGE_KEY));
    entries[name] = value;
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(entries));
  },
  removeItem: (name) => {
    const entries = parseAccountsStorage(localStorage.getItem(ACCOUNTS_STORAGE_KEY));
    delete entries[name];

    if (Object.keys(entries).length === 0) {
      localStorage.removeItem(ACCOUNTS_STORAGE_KEY);
      return;
    }

    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(entries));
  },
};

export interface SigningAccount {
  id: string;
  email: string;
  session: AppleAPISession;
  account: Account;
  team?: Team;
  certificates: Certificate[];
  devices: Device[];
  selectedCertificateId?: string;
  privateKey?: Uint8Array;
}

interface SigningState {
  accounts: SigningAccount[];
  currentAccountId: string | null;
  anisetteData: AnisetteData | null;
  isProvisioned: boolean;

  addAccount: (account: SigningAccount) => void;
  removeAccount: (id: string) => void;
  setCurrentAccount: (id: string | null) => void;
  updateAccount: (id: string, updates: Partial<SigningAccount>) => void;
  setAnisetteData: (data: AnisetteData | null) => void;
  setIsProvisioned: (provisioned: boolean) => void;
  clearAll: () => void;
}

export const useSigningStore = create<SigningState>()(
  persist(
    (set) => ({
      accounts: [],
      currentAccountId: null,
      anisetteData: null,
      isProvisioned: false,

      addAccount: (account) =>
        set((state) => ({
          accounts: [...state.accounts, account],
          currentAccountId: account.id,
        })),

      removeAccount: (id) =>
        set((state) => ({
          accounts: state.accounts.filter((a) => a.id !== id),
          currentAccountId:
            state.currentAccountId === id ? null : state.currentAccountId,
        })),

      setCurrentAccount: (id) => set({ currentAccountId: id }),

      updateAccount: (id, updates) =>
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.id === id ? { ...a, ...updates } : a
          ),
        })),

      setAnisetteData: (data) => set({ anisetteData: data }),

      setIsProvisioned: (provisioned) => set({ isProvisioned: provisioned }),

      clearAll: () =>
        set({
          accounts: [],
          currentAccountId: null,
          anisetteData: null,
          isProvisioned: false,
        }),
    }),
    {
      name: SIGNING_STORAGE_ENTRY,
      storage: createJSONStorage(() => accountsLocalStorage),
      partialize: (state) => ({
        accounts: state.accounts.map((acc) => ({
          ...acc,
          session: {
            dsid: acc.session.dsid,
            authToken: acc.session.authToken,
            anisetteData: acc.session.anisetteData,
          },
          account: acc.account,
          team: acc.team,
          certificates: acc.certificates.map((c) => ({
            ...c,
            publicKey: Array.from(c.publicKey),
            privateKey: c.privateKey ? Array.from(c.privateKey) : undefined,
          })),
          devices: acc.devices,
          selectedCertificateId: acc.selectedCertificateId,
          privateKey: acc.privateKey ? Array.from(acc.privateKey) : undefined,
        })),
        currentAccountId: state.currentAccountId,
        isProvisioned: state.isProvisioned,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.accounts) {
          state.accounts = state.accounts.map((acc) => ({
            ...acc,
            session: {
              ...acc.session,
              anisetteData: {
                ...acc.session.anisetteData,
                date: new Date(acc.session.anisetteData.date),
              },
            },
            certificates: acc.certificates.map((c) => ({
              ...c,
              publicKey: new Uint8Array(c.publicKey as unknown as number[]),
              privateKey: c.privateKey
                ? new Uint8Array(c.privateKey as unknown as number[])
                : undefined,
            })),
            privateKey: acc.privateKey
              ? new Uint8Array(acc.privateKey as unknown as number[])
              : undefined,
          }));
        }
      },
    }
  )
);
