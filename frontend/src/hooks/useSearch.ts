import { create } from "zustand";
import type { Software } from "../types";
import { searchApps, lookupApp } from "../api/search";

interface SearchState {
  term: string;
  country: string;
  entity: string;
  results: Software[];
  loading: boolean;
  error: string | null;
  setSearchParam: (
    param: Partial<Pick<SearchState, "term" | "country" | "entity">>,
  ) => void;
  search: (term: string, country: string, entity: string) => Promise<void>;
  lookup: (bundleId: string, country: string) => Promise<void>;
  clear: () => void; // 新增：清空搜索状态的方法
}

export const useSearch = create<SearchState>((set) => ({
  term: "",
  country: "",
  entity: "",
  results: [],
  loading: false,
  error: null,
  setSearchParam: (param) => set((state) => ({ ...state, ...param })),
  search: async (term, country, entity) => {
    set({ loading: true, error: null, term, country, entity });
    try {
      const apps = await searchApps(term, country, entity);
      set({ results: apps });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Search failed",
        results: [],
      });
    } finally {
      set({ loading: false });
    }
  },
  lookup: async (bundleId, country) => {
    set({ loading: true, error: null });
    try {
      const app = await lookupApp(bundleId, country);
      set({ results: app ? [app] : [] });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Lookup failed",
        results: [],
      });
    } finally {
      set({ loading: false });
    }
  },
  // 清空关键词、结果和错误信息，但保留选择的国家和设备类型（作为用户偏好）
  clear: () => set({ term: "", results: [], error: null }),
}));
