import { create } from "zustand";

// Readiness of the SAP signer, shared so any screen can show what it is doing.
//
// Preparing it takes a minute or two — 38 MB of Apple binaries and ten million
// emulated instructions — so it starts on its own in the background as soon as
// there is an account to prepare it for. A button pressed while that is under
// way shows the progress already being made instead of starting over in
// silence.

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

/** A human-readable line for the current stage, or null when there is nothing to say. */
export function sapStatusKey(stage: SapStage): string | null {
  switch (stage) {
    case "assets":
      return "accounts.addForm.preparingAssets";
    case "setup":
      return "accounts.addForm.preparingSigner";
    case "error":
      return "accounts.addForm.signerFailed";
    default:
      return null;
  }
}
