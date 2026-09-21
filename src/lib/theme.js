const light = {
  mode: "light",

  // Zemin beyaz değil: saf beyaz + doygun vurgu uzun bakışta yorar
  bg: "#E7EDF3",
  surface: "#F7FAFD",
  surfaceAlt: "#EFF4F9",
  surfaceSunken: "#DAE3EC",

  // Kontrast oranları zemine karşı ölçüldü: 14.6 / 7.5 / 4.6
  ink: "#101C27",
  inkSoft: "#3B4C5B",
  inkFaint: "#586C7D",

  line: "#CBD7E2",
  lineStrong: "#AFBECC",

  brand: "#1F5A8C",
  brandHover: "#184B77",
  brandSoft: "#CFE0EF",
  brandTint: "#E0EBF5",
  onBrand: "#FFFFFF",

  // Yeşil yalnızca "çözüldü" için: her yerde kullanılınca anlamını yitiriyor
  ok: "#2E7355",
  okSoft: "#D6E8DF",
  warn: "#8C5A18",
  warnSoft: "#F0E4D0",
  danger: "#9B3A30",
  dangerSoft: "#F1DCD9",
  info: "#1F5A8C",
  infoSoft: "#CFE0EF",

  wash: "none",
};

const dark = {
  mode: "dark",

  bg: "#0D1620",
  surface: "#141F2B",
  surfaceAlt: "#1A2733",
  surfaceSunken: "#101A24",

  ink: "#E3EBF2",
  inkSoft: "#A2B3C2",
  inkFaint: "#788C9C",

  line: "#233240",
  lineStrong: "#334555",

  brand: "#61A5DB",
  brandHover: "#7CB8E7",
  brandSoft: "#16334D",
  brandTint: "#122839",
  onBrand: "#071219",

  ok: "#5FB08A",
  okSoft: "#142C22",
  warn: "#D09A55",
  warnSoft: "#2B2115",
  danger: "#D4756A",
  dangerSoft: "#2E1916",
  info: "#61A5DB",
  infoSoft: "#16334D",

  wash: "none",
};

// Eski kodla uyum: durum renkleri brand üzerinden değil ok üzerinden
light.brandOk = light.ok;
dark.brandOk = dark.ok;

export const THEMES = { light, dark };

export const F = {
  body: "'IBM Plex Sans', system-ui, sans-serif",
  display: "'IBM Plex Sans', system-ui, sans-serif",
  // Yalnızca çağrı ve gereksinim kodlarında: listede alt alta hizalanmaları için
  mono: "'IBM Plex Mono', ui-monospace, monospace",
};

// Modüler ölçek. Aradaki keyfi değerler yok, hiyerarşi boyut farkıyla kuruluyor.
export const T = {
  xs: 12,
  sm: 14,
  base: 16,
  md: 20,
  lg: 28,
  xl: 36,
  hero: 64,
};

// Boşluk da ölçekli: 4'ün katları
export const S = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 44,
  8: 64,
};

export const shadows = (mode) =>
  mode === "dark"
    ? { flat: "none", lift: "0 8px 24px rgba(0,0,0,0.38)" }
    : { flat: "none", lift: "0 1px 3px rgba(16,28,39,0.07)" };
