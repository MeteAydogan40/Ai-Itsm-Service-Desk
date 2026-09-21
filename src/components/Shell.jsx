import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../lib/ThemeContext";
import { F, T } from "../lib/theme";
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
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F.body, color: C.ink }}>
      <header
        style={{
          borderBottom: `1px solid ${C.line}`,
          background: C.mode === "dark" ? "rgba(13,22,32,0.84)" : "rgba(247,250,253,0.84)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth,
            margin: "0 auto",
            padding: "0 32px",
            height: 60,
            display: "flex",
            alignItems: "center",
            gap: 28,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexShrink: 0 }}>
            <span
              style={{
                fontSize: T.md,
                fontWeight: 600,
                letterSpacing: "-0.018em",
                color: C.brand,
              }}
            >
              Destek Masası
            </span>
            {subtitle && <span style={{ fontSize: T.sm, color: C.inkFaint }}>{subtitle}</span>}
          </div>

          {links.length > 1 && (
            <nav style={{ display: "flex", gap: 2 }}>
              {links.map((l) => {
                const active = location.pathname === l.to;
                return (
                  <button
                    key={l.to}
                    onClick={() => navigate(l.to)}
                    aria-current={active ? "page" : undefined}
                    style={{
                      fontFamily: F.body,
                      fontSize: T.sm,
                      fontWeight: active ? 500 : 400,
                      padding: "6px 12px",
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
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: T.sm, color: C.inkSoft }}>
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
                    fontSize: T.sm,
                    color: C.inkFaint,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Çıkış
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main style={{ maxWidth, margin: "0 auto", padding: "40px 32px 72px" }}>{children}</main>
    </div>
  );
}
