import { create } from "zustand";
import { persist } from "zustand/middleware";

type ThemeType = "light" | "dark" | "system";

interface SettingsState {
  defaultCountry: string;
  defaultEntity: "iPhone" | "iPad";
  theme: ThemeType;
  setDefaultCountry: (country: string) => void;
  setDefaultEntity: (entity: "iPhone" | "iPad") => void;
  setTheme: (theme: ThemeType) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      defaultCountry: "US",
      defaultEntity: "iPhone",
      theme: "light",
      setDefaultCountry: (country) => set({ defaultCountry: country }),
      setDefaultEntity: (entity) => set({ defaultEntity: entity }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "asspp-settings",
    },
  ),
);
