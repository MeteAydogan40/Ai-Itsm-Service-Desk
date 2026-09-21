import React, { useState } from "react";
import { useTheme } from "../lib/ThemeContext";
import { F, T } from "../lib/theme";

/**
 * Grafikler elle SVG ile çiziliyor.
 *
 * Bir kütüphane (Recharts gibi) hazır etkileşim getirirdi ama
 * ~100 KB ekliyor ve varsayılan görünümünü temaya uydurmak için
 * çoğu stilini ezmek gerekiyor. Buradaki grafikler birkaç yüz
 * satır; kütüphane getirisi maliyetini karşılamıyor.
 */

const PAD = { left: 44, right: 12, top: 16, bottom: 30 };

function niceMax(value) {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

/* ---------- Çizgi grafiği ---------- */

export function LineChart({ series, labels, height = 210, valueLabel = "" }) {
  const { C } = useTheme();
  const [hover, setHover] = useState(null);

  const width = 720;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.points)));
  const count = labels.length;

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const x = (i) => PAD.left + (count > 1 ? (i / (count - 1)) * plotW : plotW / 2);
  const y = (v) => PAD.top + plotH - (v / max) * plotH;

  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", display: "block" }}
        role="img"
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              y1={y(t)}
              x2={width - PAD.right}
              y2={y(t)}
              stroke={C.line}
              strokeWidth="1"
            />
            <text
              x={PAD.left - 10}
              y={y(t) + 4}
              textAnchor="end"
              fontSize="12"
              fontFamily={F.body}
              fill={C.inkFaint}
            >
              {t}
            </text>
          </g>
        ))}

        {series.map((s) => (
          <path
            key={s.name}
            d={s.points.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ")}
            fill="none"
            stroke={s.color === "ok" ? C.ok : C.brand}
            strokeWidth="2"
            strokeDasharray={s.dashed ? "4 4" : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {hover !== null && (
          <line
            x1={x(hover)}
            y1={PAD.top}
            x2={x(hover)}
            y2={PAD.top + plotH}
            stroke={C.lineStrong}
            strokeWidth="1"
          />
        )}

        {series.map((s) =>
          hover !== null ? (
            <circle
              key={`${s.name}-dot`}
              cx={x(hover)}
              cy={y(s.points[hover])}
              r="4"
              fill={s.color === "ok" ? C.ok : C.brand}
              stroke={C.surface}
              strokeWidth="2"
            />
          ) : null,
        )}

        {labels.map((label, i) =>
          i % Math.ceil(count / 4) === 0 ? (
            <text
              key={label + i}
              x={x(i)}
              y={height - 8}
              textAnchor={i === 0 ? "start" : i === count - 1 ? "end" : "middle"}
              fontSize="12"
              fontFamily={F.body}
              fill={C.inkFaint}
            >
              {label}
            </text>
          ) : null,
        )}

        {labels.map((_, i) => (
          <rect
            key={`hit-${i}`}
            x={x(i) - plotW / count / 2}
            y={PAD.top}
            width={plotW / count}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      {hover !== null && (
        <Tooltip C={C} label={labels[hover]}>
          {series.map((s) => (
            <div key={s.name} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: s.color === "ok" ? C.ok : C.brand,
                }}
              />
              <span style={{ color: C.inkSoft }}>{s.name}</span>
              <strong style={{ marginLeft: "auto", color: C.ink }}>
                {s.points[hover]} {valueLabel}
              </strong>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

/* ---------- Yatay çubuk ---------- */

export function BarList({ items, valueLabel = "" }) {
  const { C } = useTheme();
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <div style={{ display: "grid", gap: 13 }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontSize: T.sm,
              color: C.inkFaint,
              width: 62,
              flexShrink: 0,
              textAlign: "right",
            }}
          >
            {item.label}
          </span>
          <div style={{ flex: 1, height: 20, background: C.surfaceSunken, borderRadius: 4 }}>
            <div
              style={{
                width: `${(item.value / max) * 100}%`,
                height: "100%",
                background: C.brand,
                borderRadius: 4,
                transition: "width 260ms ease",
              }}
            />
          </div>
          <span style={{ fontSize: T.sm, color: C.ink, width: 34, textAlign: "right" }}>
            {item.value}
            {valueLabel}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Yığılmış çubuk ---------- */

export function StackedBars({ items, legend }) {
  const { C } = useTheme();
  const max = Math.max(1, ...items.map((i) => i.primary + i.secondary));

  return (
    <div>
      <div style={{ display: "grid", gap: 15 }}>
        {items.map((item) => (
          <div key={item.label}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                fontSize: T.sm,
                marginBottom: 6,
              }}
            >
              <span style={{ color: C.ink }}>{item.label}</span>
              <span style={{ color: C.inkFaint, fontSize: T.xs }}>
                {item.primary + item.secondary}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                height: 8,
                background: C.surfaceSunken,
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div style={{ width: `${(item.primary / max) * 100}%`, background: C.brand }} />
              <div style={{ width: `${(item.secondary / max) * 100}%`, background: C.brandSoft }} />
            </div>
          </div>
        ))}
      </div>

      {legend && <Legend C={C} items={legend} />}
    </div>
  );
}

/* ---------- Ortak parçalar ---------- */

export function Legend({ C: themeColors, items }) {
  const { C: ctx } = useTheme();
  const C = themeColors || ctx;

  const resolve = (key) =>
    ({ brand: C.brand, brandSoft: C.brandSoft, ok: C.ok, warn: C.warn, danger: C.danger }[key] ||
    key);

  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        fontSize: T.xs,
        color: C.inkFaint,
        marginTop: 14,
        flexWrap: "wrap",
      }}
    >
      {items.map((item) => (
        <span key={item.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span
            style={{ width: 9, height: 9, borderRadius: 2, background: resolve(item.color) }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ C, label, children }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        background: C.surface,
        border: `1px solid ${C.lineStrong}`,
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: T.xs,
        minWidth: 168,
        pointerEvents: "none",
        boxShadow: "0 4px 14px rgba(16,28,39,0.10)",
      }}
    >
      <div style={{ color: C.inkFaint, marginBottom: 7 }}>{label}</div>
      <div style={{ display: "grid", gap: 5 }}>{children}</div>
    </div>
  );
}

/**
 * Grafiğin altındaki okuma notu.
 * Çoğu gösterge paneli sayı gösterir, anlam vermez.
 */
export function Reading({ children }) {
  const { C } = useTheme();
  return (
    <p
      style={{
        margin: "16px 0 0",
        fontSize: T.sm,
        color: C.inkSoft,
        lineHeight: 1.6,
        maxWidth: "62ch",
      }}
    >
      {children}
    </p>
  );
}
