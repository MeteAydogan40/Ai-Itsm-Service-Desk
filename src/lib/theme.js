const light = {
  mode: "light",

  bg: "#E4EDE4",
  surface: "#FAFCF8",
  surfaceAlt: "#EFF5ED",
  surfaceSunken: "#E0E9DE",

  ink: "#111E18",
  inkSoft: "#42544B",
  inkFaint: "#7C8B82",

  line: "#D3DFD1",
  lineStrong: "#B8C8B6",

  brand: "#1B5E4A",
  brandHover: "#164C3C",
  brandSoft: "#D6E8DE",
  brandTint: "#E7F2EB",
  onBrand: "#FFFFFF",

  warn: "#9C6014",
  warnSoft: "#F2E4CC",
  danger: "#94322B",
  dangerSoft: "#F2DCD8",
  info: "#255468",
  infoSoft: "#DCE8ED",

  wash:
    "radial-gradient(1200px 560px at 86% -10%, rgba(27,94,74,0.16), transparent 60%), radial-gradient(900px 500px at 4% 108%, rgba(27,94,74,0.10), transparent 62%)",
};

const dark = {
  mode: "dark",

  bg: "#0D1411",
  surface: "#151E1A",
  surfaceAlt: "#1B2621",
  surfaceSunken: "#101915",

  ink: "#E6EEE8",
  inkSoft: "#A3B3AA",
  inkFaint: "#6E7F76",

  line: "#243029",
  lineStrong: "#33443B",

  brand: "#57B191",
  brandHover: "#6BC0A2",
  brandSoft: "#17322A",
  brandTint: "#132621",
  onBrand: "#08120E",

  warn: "#D9A05B",
  warnSoft: "#2E2418",
  danger: "#D97A70",
  dangerSoft: "#301C1A",
  info: "#79AECB",
  infoSoft: "#16262E",

  wash:
    "radial-gradient(1200px 560px at 86% -10%, rgba(87,177,145,0.15), transparent 60%), radial-gradient(900px 500px at 4% 108%, rgba(87,177,145,0.08), transparent 62%)",
};

export const THEMES = { light, dark };

export const F = {
  display: "'Bricolage Grotesque', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  // Yalnızca çağrı ve gereksinim kodlarında: listede alt alta hizalanmaları için
  mono: "'JetBrains Mono', ui-monospace, monospace",
};

export const shadows = (mode) =>
  mode === "dark"
    ? { flat: "none", lift: "0 10px 30px rgba(0,0,0,0.42)" }
    : { flat: "0 1px 2px rgba(17,30,24,0.05)", lift: "0 10px 30px rgba(17,30,24,0.09)" };
