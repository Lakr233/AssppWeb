// Updated toast state management to support titles and longer timeouts
import { create } from "zustand";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  title?: string; // Newly added optional title property / 新增的可选标题属性
}

interface ToastStore {
  toasts: Toast[];
  addToast: (message: string, type: ToastType, title?: string) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type, title) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({ toasts: [...state.toasts, { id, message, type, title }] }));
    // Auto remove after 5 seconds to allow reading multiline text / 为了让用户有时间阅读多行文本，延长至 5 秒自动移除
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));