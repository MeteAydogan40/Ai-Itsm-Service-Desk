import React, { createContext, useContext, useState, useCallback } from "react";
import { useTheme } from "../lib/ThemeContext";
import { T } from "../lib/theme";
import { Icon } from "./UI";

/**
 * Eylem sonrası kısa geri bildirim.
 * Bir gereksinimi onaylamak veya test işaretlemek sessizce
 * gerçekleşiyordu; kullanıcı işin olduğunu göremiyordu.
 */

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((message, tone = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <ToastStack toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

function ToastStack({ toasts }) {
  const { C } = useTheme();
  if (!toasts.length) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 72,
        right: 24,
        zIndex: 60,
        display: "grid",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => {
        const color = { ok: C.ok, warn: C.warn, danger: C.danger }[t.tone] || C.brand;
        return (
          <div
            key={t.id}
            role="status"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: C.surface,
              border: `1px solid ${C.lineStrong}`,
              borderLeft: `3px solid ${color}`,
              borderRadius: 8,
              padding: "11px 15px",
              fontSize: T.sm,
              color: C.ink,
              boxShadow: "0 6px 20px rgba(16,28,39,0.12)",
              animation: "slideIn 180ms ease",
              maxWidth: 340,
            }}
          >
            <span style={{ color, display: "grid", placeItems: "center", flexShrink: 0 }}>
              <Icon name="check" size={15} strokeWidth={2.2} />
            </span>
            {t.message}
          </div>
        );
      })}
    </div>
  );
}
