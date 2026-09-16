import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../lib/ThemeContext";
import { F, shadows } from "../lib/theme";
import { Button, ThemeToggle, Label, TextInput } from "../components/UI";
import { setUser, homeFor } from "../lib/session";

const ROLES = [
  { id: "employee", title: "Çalışan", desc: "Bir sorun bildireceğim" },
  { id: "technician", title: "Teknisyen", desc: "Gelen çağrılara bakacağım" },
  { id: "admin", title: "Yönetici", desc: "Kategori, grup ve bilgi bankasını yöneteceğim" },
];

const STATS = [
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
        backgroundImage: C.wash,
        backgroundAttachment: "fixed",
        fontFamily: F.body,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "20px 28px", display: "flex", justifyContent: "flex-end" }}>
        <ThemeToggle />
      </div>

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 400px",
          gap: 64,
          alignItems: "center",
          maxWidth: 1060,
          width: "100%",
          margin: "0 auto",
          padding: "0 28px 60px",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: F.display,
              fontSize: "clamp(44px, 6vw, 74px)",
              lineHeight: 0.94,
              fontWeight: 700,
              letterSpacing: "-0.045em",
              color: C.ink,
              margin: 0,
            }}
          >
            Çağrı açmadan
            <br />
            önce bir bakalım.
          </h1>

          <p
            style={{
              fontSize: 16.5,
              lineHeight: 1.62,
              color: C.inkSoft,
              margin: "26px 0 0",
              maxWidth: "44ch",
            }}
          >
            Sorununuzu kendi cümlelerinizle anlatın. Destek asistanı ne olduğunu
            anlayıp size özel birkaç çözüm önerir. İşe yaramazsa çağrıyı kendisi
            açar ve denediklerinizi teknik ekibe iletir.
          </p>

          <div
            style={{
              display: "flex",
              gap: 34,
              marginTop: 40,
              paddingTop: 26,
              borderTop: `1px solid ${C.lineStrong}`,
            }}
          >
            {STATS.map((s) => (
              <div key={s.label}>
                <div
                  style={{
                    fontFamily: F.display,
                    fontSize: 27,
                    fontWeight: 700,
                    letterSpacing: "-0.03em",
                    color: C.brand,
                    lineHeight: 1,
                  }}
                >
                  {s.value}
                </div>
                <div style={{ fontSize: 12.5, color: C.inkFaint, marginTop: 6 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            background: C.surface,
            border: `1px solid ${C.line}`,
            borderRadius: 16,
            padding: 26,
            boxShadow: S.lift,
          }}
        >
          <Label>Adınız</Label>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enter()}
            placeholder="Mete Yılmaz"
            style={{ fontSize: 15, padding: "12px 14px", marginBottom: 22 }}
          />

          <Label>Nasıl giriyorsunuz?</Label>
          <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
            {ROLES.map((r) => (
              <RoleOption
                key={r.id}
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

          <p style={{ fontSize: 12.5, color: C.inkFaint, marginTop: 16, marginBottom: 0, lineHeight: 1.55 }}>
            Her sekme kendi oturumunu tutar. İki rolü ayrı sekmelerde açıp
            aralarındaki canlı akışı izleyebilirsiniz.
          </p>
        </div>
      </div>
    </div>
  );
}

function RoleOption({ active, onClick, title, desc }) {
  const { C } = useTheme();
  return (
    <div
      onClick={onClick}
      style={{
        border: `1px solid ${active ? C.brand : C.lineStrong}`,
        background: active ? C.brandTint : "transparent",
        borderRadius: 10,
        padding: "13px 15px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
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
        {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.brand }} />}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{title}</div>
        <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 1 }}>{desc}</div>
      </div>
    </div>
  );
}
