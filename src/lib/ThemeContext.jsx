import React, { createContext, useContext, useEffect, useState } from "react";
import { THEMES, shadows } from "./theme";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem("itsm_theme") || "light");

  useEffect(() => {
    localStorage.setItem("itsm_theme", mode);
    // Tarayıcının kendi arayüzü (kaydırma çubuğu, form öğeleri) de temaya uysun
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  const value = {
    C: THEMES[mode],
    S: shadows(mode),
    mode,
    toggle: () => setMode((m) => (m === "light" ? "dark" : "light")),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme, ThemeProvider içinde kullanılmalı");
  return ctx;
}
