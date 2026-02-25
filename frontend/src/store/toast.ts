import { create } from "zustand";
import type { ReactNode } from "react"; // NEW: Added ReactNode import for custom JSX messages

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  // NEW: Allow ReactNode for formatted messages
  // 新增：允许 ReactNode 以支持富文本和加粗等格式
  message: string | ReactNode; 
  type: ToastType;
  title?: string | ReactNode;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (message: string | ReactNode, type: ToastType, title?: string | ReactNode) => void;
  removeToast: (id: string) => void;
}

let nextId = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type, title) => {
    const id = String(nextId++);
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, title }],
    }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
