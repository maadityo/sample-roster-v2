"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ToastContextValue {
  toast: (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;
}

const ToastContext = React.createContext<ToastContextValue>({
  toast: () => {},
});

export function useToast() {
  return React.useContext(ToastContext);
}

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}

export function Toaster({ children }: { children?: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback(
    (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, ...opts }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-lg p-4 shadow-lg border text-sm animate-in slide-in-from-bottom-4 pointer-events-auto",
              t.variant === "destructive"
                ? "bg-red-50 border-red-200 text-red-900"
                : "bg-white border-gray-200 text-gray-900"
            )}
          >
            <p className="font-semibold">{t.title}</p>
            {t.description && (
              <p className="text-gray-600 mt-0.5">{t.description}</p>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
