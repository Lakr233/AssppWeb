import { create } from 'zustand';
import * as downloadsApi from '../api/downloads';
import type { DownloadTask, Software, Sinf } from '../types';

interface DownloadsState {
  tasks: DownloadTask[];
  loading: boolean;
  accountHashes: string[];
  setAccountHashes: (hashes: string[]) => void;
  fetchTasks: () => Promise<void>;
  startDownload: (data: {
    software: Software;
    accountHash: string;
    downloadURL: string;
    sinfs: Sinf[];
  }) => Promise<void>;
  pauseDownload: (id: string) => Promise<void>;
  resumeDownload: (id: string) => Promise<void>;
  deleteDownload: (id: string) => Promise<void>;
}

let pollInterval: ReturnType<typeof setInterval> | null = null;

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  tasks: [],
  loading: false,
  accountHashes: [],

  setAccountHashes: (hashes) => set({ accountHashes: hashes }),

  fetchTasks: async () => {
    const { accountHashes } = get();
    set({ loading: true });
    try {
      const tasks = await downloadsApi.fetchDownloads(accountHashes);
      set({ tasks, loading: false });

      const hasActive = tasks.some(
        (t) => t.status === 'downloading' || t.status === 'pending' || t.status === 'injecting',
      );
      if (hasActive && !pollInterval) {
        pollInterval = setInterval(() => {
          get().fetchTasks();
        }, 2000);
      } else if (!hasActive && pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    } catch {
      set({ loading: false });
    }
  },

  startDownload: async (data) => {
    await downloadsApi.startDownload(data);
    await get().fetchTasks();
  },

  pauseDownload: async (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    await downloadsApi.pauseDownload(id, task.accountHash);
    await get().fetchTasks();
  },

  resumeDownload: async (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    await downloadsApi.resumeDownload(id, task.accountHash);
    await get().fetchTasks();
  },

  deleteDownload: async (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    await downloadsApi.deleteDownload(id, task.accountHash);
    set({ tasks: get().tasks.filter((t) => t.id !== id) });
  },
}));
