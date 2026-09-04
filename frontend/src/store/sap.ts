import { create } from "zustand";

// Readiness of the SAP signer, shared so any screen can show what it is
// doing. Preparation means ~14 MB of assets (first run only) plus the
// emulation setup; both are quick here (~1 s total), but the download makes
// a progress line worth showing while it lasts.

export type SapStage = "idle" | "assets" | "setup" | "ready" | "error";

interface SapStore {
  stage: SapStage;
  /** 0 to 100 while assets download, null once past that. */
  percent: number | null;
  error: string | null;
  /** The hardware id the signer was prepared for. */
  hardwareID: string | null;

  begin: (hardwareID: string) => void;
  setAssets: (percent: number) => void;
  setSetup: () => void;
  setReady: () => void;
  setError: (message: string) => void;
}

export const useSapStore = create<SapStore>((set) => ({
  stage: "idle",
  percent: null,
  error: null,
  hardwareID: null,

  begin: (hardwareID) =>
    set({ stage: "assets", percent: 0, error: null, hardwareID }),
  setAssets: (percent) => set({ stage: "assets", percent }),
  setSetup: () => set({ stage: "setup", percent: null }),
  setReady: () => set({ stage: "ready", percent: null, error: null }),
  setError: (message) => set({ stage: "error", percent: null, error: message }),
}));
