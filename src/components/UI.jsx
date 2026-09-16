import React from "react";
import { useTheme } from "../lib/ThemeContext";
import { F } from "../lib/theme";

/* ---------- Tags ---------- */

export function Tag({ text, tone = "neutral" }) {
  const { C } = useTheme();
  const palette = {
    brand: [C.brandSoft, C.brand],
    warn: [C.warnSoft, C.warn],
    danger: [C.dangerSoft, C.danger],
    info: [C.infoSoft, C.info],
    neutral: [C.surfaceSunken, C.inkSoft],
  }[tone];

  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: F.body,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "-0.01em",
        padding: "3px 9px",
        borderRadius: 5,
        background: palette[0],
        color: palette[1],
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

export const priorityTone = (p) =>
  p === "Yüksek" ? "danger" : p === "Düşük" ? "neutral" : "warn";

export const statusTone = (s) =>
  s === "Çözüldü" ? "brand" : s === "İşlemde" ? "info" : "warn";

export const resultTone = (r) =>
  r === "Başarılı" ? "brand" : r === "Başarısız" ? "danger" : r ? "neutral" : null;

export const reqTypeTone = (t) =>
  t === "Yetki" ? "danger" : t === "Entegrasyon" ? "info" : t === "Veri" ? "warn" : "neutral";

export const testTypeTone = (t) =>
  t === "Negatif" ? "warn" : t === "Yetki" ? "danger" : t === "Sınır Değer" ? "info" : "neutral";

// Öncelik ve durumu tek bakışta okutan liste şeridi
export function railColor(C, ticket) {
  if (ticket.status === "Çözüldü") return C.brand;
  if (ticket.priority === "Yüksek") return C.danger;
  if (ticket.status === "İşlemde") return C.info;
  return C.warn;
}

/* ---------- Buttons ---------- */

export function Button({ children, onClick, variant = "primary", disabled, style }) {
  const { C } = useTheme();
  const v = {
    primary: { bg: C.brand, fg: C.onBrand, br: "none" },
    dark: { bg: C.ink, fg: C.bg, br: "none" },
    ghost: { bg: "transparent", fg: C.inkSoft, br: `1px solid ${C.lineStrong}` },
    soft: { bg: C.brandSoft, fg: C.brand, br: `1px solid ${C.brand}44` },
    danger: { bg: "transparent", fg: C.danger, br: `1px solid ${C.danger}66` },
  }[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: F.body,
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: "-0.01em",
        padding: "10px 18px",
        borderRadius: 9,
        border: v.br,
        background: disabled ? C.surfaceSunken : v.bg,
        color: disabled ? C.inkFaint : v.fg,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 130ms ease",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

const ICON_PATHS = {
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  star: "M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z",
  plus: "M12 5v14M5 12h14",
  close: "M18 6L6 18M6 6l12 12",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5-5 5 5M12 5v13",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  sun: "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
};

export function Icon({ name, size = 14, strokeWidth = 1.9 }) {
  const extra = name === "sun" ? <circle cx="12" cy="12" r="4" /> : null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {extra}
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

export function IconButton({ name, onClick, title, danger, size = 26 }) {
  const { C } = useTheme();
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        borderRadius: 6,
        border: `1px solid ${C.line}`,
        background: "transparent",
        color: danger ? C.danger : C.inkSoft,
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <Icon name={name} />
    </button>
  );
}

export function ThemeToggle() {
  const { C, mode, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label={mode === "light" ? "Koyu temaya geç" : "Açık temaya geç"}
      title={mode === "light" ? "Koyu tema" : "Açık tema"}
      style={{
        width: 32,
        height: 32,
        display: "grid",
        placeItems: "center",
        borderRadius: 8,
        border: `1px solid ${C.line}`,
        background: "transparent",
        color: C.inkSoft,
        cursor: "pointer",
      }}
    >
      <Icon name={mode === "light" ? "moon" : "sun"} size={15} />
    </button>
  );
}

/* ---------- Form controls ---------- */

function controlStyle(C, extra = {}) {
  return {
    width: "100%",
    fontFamily: F.body,
    fontSize: 13.5,
    padding: "9px 11px",
    borderRadius: 8,
    border: `1px solid ${C.lineStrong}`,
    outline: "none",
    background: C.surfaceAlt,
    color: C.ink,
    ...extra,
  };
}

export function Label({ children, hint }) {
  const { C } = useTheme();
  return (
    <>
      <label style={{ fontSize: 12, color: C.inkSoft, display: "block", marginBottom: 4 }}>
        {children}
      </label>
      {hint && (
        <div style={{ fontSize: 11.5, color: C.inkFaint, marginBottom: 6, lineHeight: 1.5 }}>
          {hint}
        </div>
      )}
    </>
  );
}

export function TextInput({ style, ...props }) {
  const { C } = useTheme();
  return <input {...props} style={controlStyle(C, style)} />;
}

export function TextArea({ style, rows = 3, ...props }) {
  const { C } = useTheme();
  return (
    <textarea
      rows={rows}
      {...props}
      style={controlStyle(C, { resize: "vertical", lineHeight: 1.6, ...style })}
    />
  );
}

export function Select({ options, style, ...props }) {
  const { C } = useTheme();
  return (
    <select {...props} style={controlStyle(C, style)}>
      {options.map((o) =>
        typeof o === "string" ? (
          <option key={o} value={o}>
            {o}
          </option>
        ) : (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ),
      )}
    </select>
  );
}

export function Checkbox({ label, checked, onChange, style }) {
  const { C } = useTheme();
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 9,
        fontSize: 13.5,
        color: C.ink,
        cursor: "pointer",
        lineHeight: 1.55,
        ...style,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ marginTop: 2, accentColor: C.brand }}
      />
      {label}
    </label>
  );
}

/* ---------- Layout ---------- */

export function Section({ title, children, style }) {
  const { C } = useTheme();
  return (
    <div style={{ marginBottom: 24, ...style }}>
      {title && (
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft, marginBottom: 10 }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

export function Note({ children, tone = "neutral", style }) {
  const { C } = useTheme();
  const palette = {
    neutral: [C.surfaceSunken, C.lineStrong],
    warn: [C.warnSoft, `${C.warn}55`],
    danger: [C.dangerSoft, `${C.danger}55`],
    info: [C.infoSoft, `${C.info}44`],
    brand: [C.brandTint, `${C.brand}44`],
  }[tone];

  return (
    <div
      style={{
        border: `1px solid ${palette[1]}`,
        background: palette[0],
        borderRadius: 10,
        padding: "12px 14px",
        fontSize: 13,
        color: C.ink,
        lineHeight: 1.6,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Progress({ value, total, style }) {
  const { C } = useTheme();
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div
      style={{
        flex: 1,
        minWidth: 100,
        height: 5,
        borderRadius: 3,
        background: C.surfaceSunken,
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: C.brand,
          transition: "width 200ms ease",
        }}
      />
    </div>
  );
}

export function Empty({ children }) {
  const { C } = useTheme();
  return <div style={{ fontSize: 13, color: C.inkFaint, lineHeight: 1.6 }}>{children}</div>;
}

/* ---------- Formatting ---------- */

export function timeAgo(iso) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "az önce";
  if (diff < 3600) return `${Math.floor(diff / 60)} dakika önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
}

export function clockTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

export function dateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function duration(from, to) {
  if (!from || !to) return null;
  const mins = Math.round((new Date(to) - new Date(from)) / 60000);
  if (mins < 1) return "1 dakikadan kısa";
  if (mins < 60) return `${mins} dakika`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} saat ${m} dakika` : `${h} saat`;
}

export function percent(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}
