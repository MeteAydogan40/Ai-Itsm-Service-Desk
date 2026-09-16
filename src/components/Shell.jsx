import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../lib/ThemeContext";
import { F } from "../lib/theme";
import { ThemeToggle } from "./UI";
import { clearUser } from "../lib/session";

const NAV = {
  employee: [{ to: "/portal", label: "Sorun bildir" }],
  technician: [
    { to: "/teknisyen", label: "Çağrılar" },
    { to: "/panel", label: "Özet" },
  ],
  admin: [
    { to: "/yonetim", label: "Yönetim" },
    { to: "/panel", label: "Özet" },
  ],
};

const ROLE_LABEL = {
  employee: "çalışan",
  technician: "teknisyen",
  admin: "yönetici",
};

export default function Shell({ user, subtitle, right, children, wide }) {
  const { C } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const links = NAV[user?.role] || [];
  const maxWidth = wide ? 1400 : 1180;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        backgroundImage: C.wash,
        backgroundAttachment: "fixed",
        fontFamily: F.body,
        color: C.ink,
      }}
    >
      <header
        style={{
          borderBottom: `1px solid ${C.line}`,
          background: C.mode === "dark" ? "rgba(13,20,17,0.7)" : "rgba(250,252,248,0.7)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth,
            margin: "0 auto",
            padding: "0 24px",
            height: 60,
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexShrink: 0 }}>
            <span
              style={{
                fontFamily: F.display,
                fontSize: 19,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: C.ink,
              }}
            >
              Destek Masası
            </span>
            {subtitle && <span style={{ fontSize: 13, color: C.inkFaint }}>{subtitle}</span>}
          </div>

          {links.length > 1 && (
            <nav style={{ display: "flex", gap: 3 }}>
              {links.map((l) => {
                const active = location.pathname === l.to;
                return (
                  <button
                    key={l.to}
                    onClick={() => navigate(l.to)}
                    style={{
                      fontFamily: F.body,
                      fontSize: 13.5,
                      fontWeight: active ? 600 : 500,
                      padding: "6px 11px",
                      borderRadius: 7,
                      border: "none",
                      background: active ? C.brandSoft : "transparent",
                      color: active ? C.brand : C.inkSoft,
                      cursor: "pointer",
                    }}
                  >
                    {l.label}
                  </button>
                );
              })}
            </nav>
          )}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
            {right}
            <ThemeToggle />
            {user && (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 13.5, color: C.inkSoft }}>
                  {user.name}
                  <span style={{ color: C.inkFaint }}> · {ROLE_LABEL[user.role]}</span>
                </span>
                <button
                  onClick={() => {
                    clearUser();
                    navigate("/");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    fontFamily: F.body,
                    fontSize: 13,
                    color: C.inkFaint,
                    cursor: "pointer",
                  }}
                >
                  Çıkış
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main style={{ maxWidth, margin: "0 auto", padding: "24px 24px 48px" }}>{children}</main>
    </div>
  );
}
