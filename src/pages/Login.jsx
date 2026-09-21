import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../lib/ThemeContext";
import { F, T, shadows } from "../lib/theme";
import { Button, ThemeToggle, Label, TextInput } from "../components/UI";
import { setUser, homeFor } from "../lib/session";

const ROLES = [
  { id: "employee", title: "Çalışan", desc: "Bir sorun bildireceğim" },
  { id: "technician", title: "Teknisyen", desc: "Gelen çağrılara bakacağım" },
  { id: "admin", title: "Yönetici", desc: "Kategori, grup ve bilgi bankasını yöneteceğim" },
];

const FACTS = [
  { value: "4", label: "soruda teşhis" },
  { value: "10", label: "kategori" },
  { value: "anlık", label: "teknisyene aktarım" },
];

export default function Login() {
  const { C, mode } = useTheme();
  const S = shadows(mode);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [role, setRole] = useState("employee");

  function enter() {
    if (!name.trim()) return;
    setUser({ name: name.trim(), role });
    navigate(homeFor(role));
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        fontFamily: F.body,
        color: C.ink,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "20px 32px", display: "flex", justifyContent: "flex-end" }}>
        <ThemeToggle />
      </div>

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 400px",
          gap: 72,
          alignItems: "center",
          maxWidth: 1080,
          width: "100%",
          margin: "0 auto",
          padding: "0 32px 72px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "clamp(40px, 5.5vw, 62px)",
              lineHeight: 1,
              fontWeight: 600,
              letterSpacing: "-0.04em",
              margin: 0,
            }}
          >
            Çağrı açmadan
            <br />
            önce bir bakalım.
          </h1>

          <p
            style={{
              fontSize: T.base,
              lineHeight: 1.65,
              color: C.inkSoft,
              margin: "26px 0 0",
              maxWidth: "46ch",
            }}
          >
            Sorununuzu kendi cümlelerinizle anlatın. Destek asistanı ne olduğunu anlayıp
            size özel birkaç çözüm önerir. İşe yaramazsa çağrıyı kendisi açar ve
            denediklerinizi teknik ekibe iletir.
          </p>

          <div
            style={{
              display: "flex",
              gap: 40,
              marginTop: 44,
              paddingTop: 28,
              borderTop: `1px solid ${C.line}`,
            }}
          >
            {FACTS.map((f) => (
              <div key={f.label}>
                <div
                  style={{
                    fontSize: T.lg,
                    fontWeight: 500,
                    letterSpacing: "-0.025em",
                    color: C.brand,
                    lineHeight: 1,
                  }}
                >
                  {f.value}
                </div>
                <div style={{ fontSize: T.sm, color: C.inkFaint, marginTop: 7 }}>{f.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            background: C.surface,
            border: `1px solid ${C.line}`,
            borderRadius: 12,
            padding: 28,
            boxShadow: S.lift,
          }}
        >
          <Label>Adınız</Label>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enter()}
            placeholder="Mete Yılmaz"
            style={{ fontSize: T.base, padding: "12px 14px", marginBottom: 24 }}
          />

          <Label>Nasıl giriyorsunuz?</Label>
          <div style={{ display: "grid", gap: 8, marginBottom: 26 }}>
            {ROLES.map((r) => (
              <RoleOption
                key={r.id}
                C={C}
                active={role === r.id}
                onClick={() => setRole(r.id)}
                title={r.title}
                desc={r.desc}
              />
            ))}
          </div>

          <Button onClick={enter} disabled={!name.trim()} style={{ width: "100%" }}>
            Devam et
          </Button>

          <p
            style={{
              fontSize: T.xs,
              color: C.inkFaint,
              margin: "16px 0 0",
              lineHeight: 1.55,
            }}
          >
            Her sekme kendi oturumunu tutar. İki rolü ayrı sekmelerde açıp aralarındaki
            canlı akışı izleyebilirsiniz.
          </p>
        </div>
      </div>
    </div>
  );
}

function RoleOption({ C, active, onClick, title, desc }) {
  return (
    <div
      onClick={onClick}
      role="radio"
      aria-checked={active}
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      style={{
        border: `1px solid ${active ? C.brand : C.lineStrong}`,
        background: active ? C.brandTint : "transparent",
        borderRadius: 9,
        padding: "13px 15px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 13,
        transition: "border-color 120ms ease, background 120ms ease",
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: `1.5px solid ${active ? C.brand : C.lineStrong}`,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {active && (
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.brand }} />
        )}
      </span>
      <span>
        <span style={{ display: "block", fontSize: T.sm, fontWeight: 500 }}>{title}</span>
        <span style={{ display: "block", fontSize: T.xs, color: C.inkSoft, marginTop: 2 }}>
          {desc}
        </span>
      </span>
    </div>
  );
}
