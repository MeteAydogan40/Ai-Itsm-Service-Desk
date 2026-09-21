import React from "react";
import { useTheme } from "../lib/ThemeContext";
import { F, T } from "../lib/theme";
import { formatMinutes } from "./UI";

// Baskıda tema ne olursa olsun kağıt renkleri kullanılır
const P = {
  ink: "#101C27",
  soft: "#3B4C5B",
  faint: "#586C7D",
  line: "#CBD7E2",
  brand: "#1F5A8C",
  brandSoft: "#CFE0EF",
  ok: "#2E7355",
  warn: "#8C5A18",
  danger: "#9B3A30",
};

export default function ReportDocument({ report, author }) {
  const { current: c, previous: p, analysis: a } = report;

  return (
    <article className="report-doc" style={docStyle}>
      <header style={{ borderBottom: `2px solid ${P.brand}`, paddingBottom: 22, marginBottom: 32 }}>
        <div style={{ fontSize: T.xs, color: P.faint, marginBottom: 10 }}>
          BT Hizmet Yönetimi · {report.period.label} Rapor
        </div>
        <h1 style={{ margin: 0, fontSize: T.xl, fontWeight: 600, letterSpacing: "-0.03em", color: P.ink }}>
          Destek Masası Dönem Raporu
        </h1>
        <div style={{ fontSize: T.sm, color: P.soft, marginTop: 10 }}>{report.label}</div>
        <div style={{ fontSize: T.xs, color: P.faint, marginTop: 14 }}>
          Hazırlayan: {author} · Oluşturulma:{" "}
          {new Date(report.generatedAt).toLocaleString("tr-TR", {
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </header>

      <Part title="1. Yönetici özeti">
        {a ? (
          <>
            {a.summary.split("\n").filter(Boolean).map((para, i) => (
              <p key={i} style={paraStyle}>{para}</p>
            ))}
            <ListBlock title="Olumlu gelişmeler" items={a.highlights} color={P.ok} />
            <ListBlock title="Dikkat gerektirenler" items={a.concerns} color={P.warn} />
            <ListBlock title="Öneriler" items={a.recommendations} color={P.brand} />
            <p style={{ ...noteStyle, marginTop: 18 }}>
              Bu değerlendirme, aşağıdaki ölçülmüş verilerden yapay zeka tarafından yazılmıştır.
              Rapordaki tüm sayılar doğrudan veritabanından alınmıştır.
            </p>
          </>
        ) : (
          <p style={noteStyle}>
            Yapay zeka servisine erişilemediği için değerlendirme metni oluşturulamadı. Aşağıdaki
            veriler eksiksizdir.
          </p>
        )}
      </Part>

      <Part title="2. Dönem özeti">
        <Table
          head={["Ölçüt", "Bu dönem", "Önceki dönem", "Değişim"]}
          rows={[
            row("Toplam bildirim", c.total, p.total),
            row("Açılan çağrı", c.opened, p.opened, true),
            row("Kapatılan çağrı", c.closed, p.closed),
            row("Öneriyle çözülen", c.deflected, p.deflected),
            row("Çağrı açılmadan çözülme oranı", `%${c.deflectionRate}`, `%${p.deflectionRate}`, false, c.deflectionRate - p.deflectionRate, "puan"),
            row("Ortanca çözüm süresi",
              c.medianMinutes === null ? "—" : formatMinutes(c.medianMinutes),
              p.medianMinutes === null ? "—" : formatMinutes(p.medianMinutes),
              true,
              c.medianMinutes !== null && p.medianMinutes !== null ? c.medianMinutes - p.medianMinutes : null,
              "dk"),
            row("Tekrarlayan problem işareti", c.recurring, p.recurring, true),
            row("Dönem sonunda açık kalan", c.stillOpen, p.stillOpen, true),
          ]}
          align={["left", "right", "right", "right"]}
        />
      </Part>

      <Part title="3. Kategori analizi">
        {c.categories.length === 0 ? (
          <p style={noteStyle}>Bu dönemde kayıt yok.</p>
        ) : (
          <>
            <Table
              head={["Kategori", "Toplam", "Teknik ekibe düşen", "Öneriyle çözülen", "Çözülme oranı"]}
              rows={c.categories.map((cat) => [
                cat.name,
                cat.total,
                cat.tickets,
                cat.deflected,
                `%${Math.round((cat.deflected / cat.total) * 100)}`,
              ])}
              align={["left", "right", "right", "right", "right"]}
            />
            <Bars items={c.categories.slice(0, 8)} />
          </>
        )}
      </Part>

      <Part title="4. Dağılım">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
          <div>
            <div style={subStyle}>Kayıt tipine göre</div>
            <Table
              head={["Tip", "Adet"]}
              rows={Object.entries(c.byType).map(([k, v]) => [k, v])}
              align={["left", "right"]}
            />
          </div>
          <div>
            <div style={subStyle}>Önceliğe göre</div>
            <Table
              head={["Öncelik", "Adet"]}
              rows={["Yüksek", "Orta", "Düşük"]
                .filter((k) => c.byPriority[k])
                .map((k) => [k, c.byPriority[k]])}
              align={["left", "right"]}
            />
          </div>
        </div>
      </Part>

      <Part title="5. Dikkat gerektiren kayıtlar">
        <div style={subStyle}>En uzun süren çözümler</div>
        {c.slowest.length === 0 ? (
          <p style={noteStyle}>Bu dönemde kapatılan kayıt yok.</p>
        ) : (
          <Table
            head={["Kayıt", "Başlık", "Kategori", "Süre"]}
            rows={c.slowest.map((s) => [
              <span key="n" style={{ fontFamily: F.mono, fontSize: T.xs }}>{s.ticket_no}</span>,
              s.title,
              s.category,
              formatMinutes(s.minutes),
            ])}
            align={["left", "left", "left", "right"]}
          />
        )}

        <div style={{ ...subStyle, marginTop: 24 }}>Başarı oranı düşük bilgi bankası kayıtları</div>
        {c.weakKnowledge.length === 0 ? (
          <p style={noteStyle}>
            En az 3 kez önerilmiş kayıtların hiçbirinin başarı oranı %50'nin altında değil.
          </p>
        ) : (
          <Table
            head={["Kayıt", "Kullanım", "Başarı"]}
            rows={c.weakKnowledge.map((k) => [k.category, k.uses, `%${k.rate}`])}
            align={["left", "right", "right"]}
          />
        )}
      </Part>

      <Part title="Ek: Dönem içinde kapatılan kayıtlar" last>
        {c.closedList.length === 0 ? (
          <p style={noteStyle}>Bu dönemde kapatılan kayıt yok.</p>
        ) : (
          <Table
            head={["Kayıt", "Başlık", "Kategori", "Sorumlu", "Kapanış"]}
            rows={c.closedList.map((t) => [
              <span key="n" style={{ fontFamily: F.mono, fontSize: T.xs }}>{t.ticket_no}</span>,
              t.title,
              t.category,
              t.assignee || "—",
              new Date(t.resolved_at).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }),
            ])}
            align={["left", "left", "left", "left", "right"]}
            small
          />
        )}
      </Part>

      <footer
        style={{
          marginTop: 40,
          paddingTop: 14,
          borderTop: `1px solid ${P.line}`,
          fontSize: T.xs,
          color: P.faint,
        }}
      >
        Destek Masası tarafından otomatik oluşturulmuştur. Oranlar sayım sonucudur; model tahmini
        içermez.
      </footer>
    </article>
  );
}

/* ---------- Yardımcılar ---------- */

// Değişim yönü: bazı ölçütlerde artış kötüdür (açık kalan, süre)
function row(label, cur, prev, lowerIsBetter = false, diffOverride, unit = "") {
  const diff =
    diffOverride !== undefined
      ? diffOverride
      : typeof cur === "number" && typeof prev === "number"
      ? cur - prev
      : null;

  let cell = "—";
  if (diff !== null && diff !== 0) {
    const good = lowerIsBetter ? diff < 0 : diff > 0;
    cell = (
      <span style={{ color: good ? P.ok : P.danger }}>
        {diff > 0 ? "+" : ""}
        {diff}
        {unit && ` ${unit}`}
      </span>
    );
  } else if (diff === 0) {
    cell = <span style={{ color: P.faint }}>değişmedi</span>;
  }

  return [label, cur, prev, cell];
}

function Part({ title, children, last }) {
  return (
    <section className="report-part" style={{ marginBottom: last ? 0 : 36 }}>
      <h2
        style={{
          fontSize: T.md,
          fontWeight: 600,
          color: P.ink,
          margin: "0 0 16px",
          paddingBottom: 8,
          borderBottom: `1px solid ${P.line}`,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function ListBlock({ title, items, color }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: T.sm, fontWeight: 600, color, marginBottom: 7 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {items.map((it, i) => (
          <li key={i} style={{ fontSize: T.sm, color: P.soft, lineHeight: 1.7 }}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function Table({ head, rows, align, small }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: small ? T.xs : T.sm }}>
      <thead>
        <tr>
          {head.map((h, i) => (
            <th
              key={h}
              style={{
                textAlign: align[i],
                fontWeight: 600,
                color: P.faint,
                fontSize: T.xs,
                padding: "0 10px 8px 0",
                borderBottom: `1px solid ${P.ink}`,
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, r) => (
          <tr key={r}>
            {cells.map((cell, i) => (
              <td
                key={i}
                style={{
                  textAlign: align[i],
                  padding: small ? "6px 10px 6px 0" : "9px 10px 9px 0",
                  borderBottom: `1px solid ${P.line}`,
                  color: P.ink,
                  verticalAlign: "top",
                }}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Bars({ items }) {
  const max = Math.max(1, ...items.map((i) => i.total));
  return (
    <div style={{ marginTop: 22, display: "grid", gap: 9 }}>
      {items.map((it) => (
        <div key={it.name} style={{ display: "grid", gridTemplateColumns: "150px 1fr 34px", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: T.xs, color: P.soft }}>{it.name}</span>
          <span style={{ display: "flex", height: 10, background: "#EEF2F6" }}>
            <span style={{ width: `${(it.tickets / max) * 100}%`, background: P.brand }} />
            <span style={{ width: `${(it.deflected / max) * 100}%`, background: P.brandSoft }} />
          </span>
          <span style={{ fontSize: T.xs, color: P.faint, textAlign: "right" }}>{it.total}</span>
        </div>
      ))}
      <div style={{ display: "flex", gap: 18, fontSize: T.xs, color: P.faint, marginTop: 4 }}>
        <span><span style={{ display: "inline-block", width: 9, height: 9, background: P.brand, marginRight: 6 }} />teknik ekibe düşen</span>
        <span><span style={{ display: "inline-block", width: 9, height: 9, background: P.brandSoft, marginRight: 6 }} />öneriyle çözülen</span>
      </div>
    </div>
  );
}

const docStyle = {
  background: "#FFFFFF",
  color: P.ink,
  fontFamily: F.body,
  maxWidth: 820,
  margin: "0 auto",
  padding: "48px 56px",
  lineHeight: 1.6,
  boxShadow: "0 2px 12px rgba(16,28,39,0.10)",
};

const paraStyle = { margin: "0 0 12px", fontSize: T.sm, color: P.soft, lineHeight: 1.75 };
const noteStyle = { margin: 0, fontSize: T.xs, color: P.faint, lineHeight: 1.6 };
const subStyle = { fontSize: T.sm, fontWeight: 600, color: P.ink, marginBottom: 10 };

export function useReportTheme() {
  return useTheme();
}
