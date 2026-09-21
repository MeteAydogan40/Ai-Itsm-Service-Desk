import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/ThemeContext";
import { F, T } from "../lib/theme";
import Shell from "../components/Shell";
import { LineChart, BarList, StackedBars, Legend, Reading } from "../components/Charts";
import { Button, Note, Empty, Tag, Skeleton, percent, formatMinutes } from "../components/UI";
import { guard } from "../lib/session";
import { useLive } from "../lib/useLive";
import { backfillEmbeddings, countMissingEmbeddings } from "../lib/embeddings";

const RANGES = [
  { id: 7, label: "7 gün" },
  { id: 30, label: "30 gün" },
  { id: 0, label: "Tümü" },
];

export default function Dashboard() {
  const { C } = useTheme();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30);
  const [data, setData] = useState({ tickets: [], deflections: [], knowledge: [] });
  const [missing, setMissing] = useState({ kb: 0, tickets: 0 });
  const [backfilling, setBackfilling] = useState(null);

  useEffect(() => {
    const u = guard(navigate, ["technician", "admin"]);
    if (!u) return;
    setUser(u);
    load();
  }, [navigate]);

  useLive("tickets", load);
  useLive("deflections", load);

  async function load() {
    const [tickets, deflections, knowledge] = await Promise.all([
      supabase.from("tickets").select("*"),
      supabase.from("deflections").select("*"),
      supabase.from("knowledge_base").select("*"),
    ]);

    setData({
      tickets: tickets.data || [],
      deflections: deflections.data || [],
      knowledge: knowledge.data || [],
    });
    setMissing(await countMissingEmbeddings());
    setLoading(false);
  }

  async function runBackfill() {
    setBackfilling({ kb: 0, tickets: 0, failed: 0, phase: "Başlıyor" });
    const report = await backfillEmbeddings(setBackfilling);
    setBackfilling({ ...report, phase: "Tamamlandı" });
    await load();
    setTimeout(() => setBackfilling(null), 4000);
  }

  if (!user) return null;

  const stats = computeStats(data, range);
  const vectorsReady = missing.kb === 0 && missing.tickets === 0;

  return (
    <Shell
      user={user}
      subtitle="özet"
      right={<RangePicker C={C} value={range} onChange={setRange} />}
    >
      {!vectorsReady && (
        <Note
          tone="warn"
          style={{ marginBottom: 28, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}
        >
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>
              Semantik arama için eksik vektör var
            </div>
            <div style={{ color: C.inkSoft }}>
              {missing.kb} bilgi bankası kaydı ve {missing.tickets} çağrı vektörlenmedi;
              bunlar semantik aramada bulunamaz.
            </div>
          </div>
          <Button onClick={runBackfill} disabled={!!backfilling}>
            {backfilling
              ? `${backfilling.phase}: ${backfilling.kb + backfilling.tickets}`
              : "Eksikleri tamamla"}
          </Button>
        </Note>
      )}

      {backfilling?.phase === "Tamamlandı" && (
        <Note tone="ok" style={{ marginBottom: 28 }}>
          Vektörleme tamamlandı: {backfilling.kb} bilgi bankası kaydı, {backfilling.tickets} çağrı
          {backfilling.failed > 0 && `, ${backfilling.failed} başarısız`}.
        </Note>
      )}

      {loading ? (
        <Skeleton lines={8} />
      ) : (
        <>
          <Hero C={C} stats={stats} range={range} />
          <Figures C={C} stats={stats} />

          <Section C={C} title="Çağrı hareketi" description="Açılan ve kapanan kayıtlar">
            {stats.timeline.labels.length < 2 ? (
              <Empty>Grafik için yeterli geçmiş veri yok.</Empty>
            ) : (
              <>
                <LineChart
                  series={[
                    { name: "açılan", points: stats.timeline.opened },
                    { name: "kapanan", points: stats.timeline.closed, color: "ok", dashed: true },
                  ]}
                  labels={stats.timeline.labels}
                />
                <Legend
                  items={[
                    { label: "açılan", color: "brand" },
                    { label: "kapanan", color: "ok" },
                  ]}
                />
                <Reading>{stats.timelineReading}</Reading>
              </>
            )}
          </Section>

          <Section C={C} title="Kategoriler" description="Hangi konular yük yaratıyor">
            {stats.categories.length === 0 ? (
              <Empty>Henüz sınıflandırılmış kayıt yok.</Empty>
            ) : (
              <>
                <StackedBars
                  items={stats.categories.map((c) => ({
                    label: c.name,
                    primary: c.tickets,
                    secondary: c.deflected,
                  }))}
                  legend={[
                    { label: "teknik ekibe düşen", color: "brand" },
                    { label: "öneriyle çözülen", color: "brandSoft" },
                  ]}
                />
                <Reading>{stats.categoryReading}</Reading>
              </>
            )}
          </Section>

          <Section C={C} title="Öneri isabeti" description="Çözümün kaçıncı adımda bulunduğu">
            {stats.deflected === 0 ? (
              <Empty>Henüz öneriyle çözülen sorun yok.</Empty>
            ) : (
              <>
                <BarList
                  items={stats.stepDistribution.map((s) => ({
                    label: `${s.step}. adım`,
                    value: s.count,
                  }))}
                />
                <Reading>{stats.stepReading}</Reading>
              </>
            )}
          </Section>

          <Section
            C={C}
            title="Bilgi bankası"
            description="Kayıtların gerçek başarı oranları"
          >
            {stats.usedKnowledge.length === 0 ? (
              <Empty>
                Henüz yeterli kullanım verisi yok. Öneriler kullanıldıkça bu liste dolacak.
              </Empty>
            ) : (
              <>
                <KnowledgeTable C={C} rows={stats.usedKnowledge} />
                <Reading>
                  Bu oranlar modelin tahmini değil, sayım sonucu: kayıt kaç kez önerildi ve
                  kaçında kullanıcı sorunun çözüldüğünü bildirdi.
                  {stats.weakKnowledge &&
                    ` ${stats.weakKnowledge} kaydının oranı düşük, gözden geçirilmesi gerekebilir.`}
                </Reading>
              </>
            )}
          </Section>

          <Section C={C} title="Teknisyen yükü" description="Açık kayıtların dağılımı" last>
            {stats.technicians.length === 0 ? (
              <Empty>Henüz üstlenilmiş kayıt yok.</Empty>
            ) : (
              <>
                <TechnicianTable C={C} rows={stats.technicians} unassigned={stats.unassigned} />
                <Reading>{stats.workloadReading}</Reading>
              </>
            )}
          </Section>
        </>
      )}
    </Shell>
  );
}

/* ---------- Hesaplama ---------- */

function computeStats({ tickets, deflections, knowledge }, rangeDays) {
  const cutoff = rangeDays ? Date.now() - rangeDays * 86400000 : 0;
  const inRange = (iso) => !cutoff || new Date(iso).getTime() >= cutoff;

  const t = tickets.filter((x) => inRange(x.created_at));
  const d = deflections.filter((x) => inRange(x.created_at));
  const total = t.length + d.length;

  // Zaman serisi
  const days = rangeDays || 30;
  const buckets = Math.min(days, 12);
  const step = Math.ceil(days / buckets);
  const now = Date.now();

  const labels = [];
  const opened = [];
  const closed = [];

  for (let i = buckets - 1; i >= 0; i--) {
    const end = now - i * step * 86400000;
    const start = end - step * 86400000;

    labels.push(
      new Date(end).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }),
    );
    opened.push(
      tickets.filter((x) => {
        const ts = new Date(x.created_at).getTime();
        return ts > start && ts <= end;
      }).length,
    );
    closed.push(
      tickets.filter((x) => {
        if (!x.resolved_at) return false;
        const ts = new Date(x.resolved_at).getTime();
        return ts > start && ts <= end;
      }).length,
    );
  }

  const totalOpened = opened.reduce((a, b) => a + b, 0);
  const totalClosed = closed.reduce((a, b) => a + b, 0);

  // Kategoriler
  const byCategory = {};
  const bump = (name, key) => {
    if (!name) return;
    byCategory[name] = byCategory[name] || { tickets: 0, deflected: 0 };
    byCategory[name][key]++;
  };
  t.forEach((x) => bump(x.category, "tickets"));
  d.forEach((x) => bump(x.category, "deflected"));

  const categories = Object.entries(byCategory)
    .map(([name, v]) => ({ name, ...v, total: v.tickets + v.deflected }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  const heaviest = categories[0];
  const mostDeflected = [...categories]
    .filter((c) => c.total >= 3)
    .sort((a, b) => b.deflected / b.total - a.deflected / a.total)[0];

  // Adım dağılımı
  const stepDistribution = [1, 2, 3, 4, 5]
    .map((step) => ({ step, count: d.filter((x) => x.resolved_at_step === step).length }))
    .filter((s, i, arr) => s.count > 0 || i < arr.findIndex((x) => x.count === 0) + 2);

  const earlyWins = d.filter((x) => x.resolved_at_step <= 2).length;

  // Çözüm süreleri
  const resolved = t.filter((x) => x.resolved_at && x.created_at);
  const durations = resolved
    .map((x) => (new Date(x.resolved_at) - new Date(x.created_at)) / 60000)
    .sort((a, b) => a - b);
  const median = durations.length
    ? Math.round(durations[Math.floor(durations.length / 2)])
    : null;

  // Bilgi bankası
  const usedKnowledge = knowledge
    .filter((k) => k.use_count > 0)
    .map((k) => ({ ...k, rate: percent(k.success_count, k.use_count) }))
    .sort((a, b) => b.use_count - a.use_count)
    .slice(0, 6);
  const weak = usedKnowledge.find((k) => k.rate < 50);

  // Teknisyen yükü
  const byTech = {};
  tickets.forEach((x) => {
    if (!x.assignee) return;
    byTech[x.assignee] = byTech[x.assignee] || { open: 0, closed: 0, durations: [] };
    if (x.status === "Çözüldü") {
      byTech[x.assignee].closed++;
      if (x.resolved_at && x.created_at) {
        byTech[x.assignee].durations.push(
          (new Date(x.resolved_at) - new Date(x.created_at)) / 60000,
        );
      }
    } else {
      byTech[x.assignee].open++;
    }
  });

  const technicians = Object.entries(byTech)
    .map(([name, v]) => {
      const sorted = [...v.durations].sort((a, b) => a - b);
      return {
        name,
        open: v.open,
        closed: v.closed,
        median: sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : null,
      };
    })
    .sort((a, b) => b.open - a.open);

  const unassigned = tickets.filter((x) => !x.assignee && x.status !== "Çözüldü").length;

  return {
    total,
    deflected: d.length,
    ticketCount: t.length,
    deflectionRate: percent(d.length, total) ?? 0,
    open: tickets.filter((x) => x.status === "Açık").length,
    inProgress: tickets.filter((x) => x.status === "İşlemde").length,
    recurring: t.filter((x) => x.recurring_flag).length,
    medianResolution: median,
    knowledgeCount: knowledge.length,
    technicianContributions: knowledge
      .filter((k) => k.source === "technician")
      .flatMap((k) => k.steps || []).length,

    timeline: { labels, opened, closed },
    timelineReading:
      totalClosed >= totalOpened
        ? `Bu dönemde ${totalOpened} kayıt açıldı, ${totalClosed} tanesi kapandı. Kuyruk birikmiyor.`
        : `Bu dönemde ${totalOpened} kayıt açıldı, ${totalClosed} tanesi kapandı. Açılan kayıtlar kapananların önünde; kuyruk büyüyor.`,

    categories,
    categoryReading: heaviest
      ? `En çok yük ${heaviest.name} tarafında (${heaviest.total} kayıt).` +
        (mostDeflected && mostDeflected.name !== heaviest.name
          ? ` ${mostDeflected.name} konusunda öneriler büyük ölçüde yetiyor.`
          : "")
      : "",

    stepDistribution,
    stepReading:
      d.length > 0
        ? `${d.length} çözümün ${earlyWins} tanesi ilk iki adımda bulundu. ` +
          (earlyWins / d.length > 0.6
            ? "Öneriler doğru sırada listeleniyor."
            : "Dağılım sona doğru kayıyor; öneri sıralaması gözden geçirilebilir.")
        : "",

    usedKnowledge,
    weakKnowledge: weak?.category,

    technicians,
    unassigned,
    workloadReading:
      unassigned > 0
        ? `${unassigned} kayıt henüz kimseye atanmadı.`
        : "Tüm açık kayıtların bir sahibi var.",
  };
}

/* ---------- Parçalar ---------- */

function RangePicker({ C, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {RANGES.map((r) => (
        <button
          key={r.id}
          onClick={() => onChange(r.id)}
          style={{
            fontFamily: F.body,
            fontSize: T.xs,
            fontWeight: value === r.id ? 500 : 400,
            padding: "5px 10px",
            borderRadius: 6,
            border: "none",
            background: value === r.id ? C.brandSoft : "transparent",
            color: value === r.id ? C.brand : C.inkFaint,
            cursor: "pointer",
          }}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function Hero({ C, stats, range }) {
  const period = range === 7 ? "Son 7 günde" : range === 30 ? "Son 30 günde" : "Bugüne kadar";

  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 26, flexWrap: "wrap" }}>
      <span
        style={{
          fontSize: T.hero,
          fontWeight: 600,
          letterSpacing: "-0.04em",
          lineHeight: 0.9,
          color: C.brand,
        }}
      >
        %{stats.deflectionRate}
      </span>
      <p style={{ margin: 0, maxWidth: "44ch", color: C.inkSoft, fontSize: T.base }}>
        {period} bildirilen{" "}
        <strong style={{ color: C.ink, fontWeight: 500 }}>
          {stats.total} konudan {stats.deflected}'i
        </strong>{" "}
        çağrı açılmadan, asistanın önerdiği adımlarla çözüldü.
      </p>
    </div>
  );
}

function Figures({ C, stats }) {
  const items = [
    { n: stats.open, k: "bekleyen çağrı" },
    { n: stats.inProgress, k: "üzerinde çalışılan" },
    {
      n: stats.medianResolution === null ? "—" : formatMinutes(stats.medianResolution),
      k: "ortanca çözüm süresi",
    },
    { n: stats.technicianContributions, k: "teknisyen katkısı" },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        borderTop: `1px solid ${C.line}`,
        borderBottom: `1px solid ${C.line}`,
        marginTop: 32,
      }}
    >
      {items.map((item, i) => (
        <div
          key={item.k}
          style={{
            padding: "22px 24px 22px 0",
            borderLeft: i === 0 ? "none" : `1px solid ${C.line}`,
            paddingLeft: i === 0 ? 0 : 24,
          }}
        >
          <div style={{ fontSize: T.lg, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            {item.n}
          </div>
          <div style={{ fontSize: T.sm, color: C.inkFaint, marginTop: 5 }}>{item.k}</div>
        </div>
      ))}
    </div>
  );
}

function Section({ C, title, description, children, last }) {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "178px 1fr",
        gap: 42,
        padding: "34px 0",
        borderBottom: last ? "none" : `1px solid ${C.line}`,
      }}
    >
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: T.md,
            fontWeight: 500,
            letterSpacing: "-0.015em",
            paddingLeft: 13,
            borderLeft: `3px solid ${C.brand}`,
          }}
        >
          {title}
        </h2>
        <p style={{ margin: "9px 0 0 16px", fontSize: T.sm, color: C.inkFaint, lineHeight: 1.5 }}>
          {description}
        </p>
      </div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </section>
  );
}

function KnowledgeTable({ C, rows }) {
  return (
    <Table
      C={C}
      head={["Kayıt", "Kaynak", "Kullanım", "Başarı"]}
      rows={rows.map((k) => [
        k.category,
        <Tag key="s" text={k.source === "technician" ? "teknisyen" : k.source === "admin" ? "elle" : "başlangıç"} tone="neutral" />,
        <MiniBar key="u" C={C} value={k.use_count} max={Math.max(...rows.map((r) => r.use_count))} />,
        `%${k.rate}`,
      ])}
    />
  );
}

function TechnicianTable({ C, rows, unassigned }) {
  const maxOpen = Math.max(1, ...rows.map((r) => r.open));
  const body = rows.map((r) => [
    r.name,
    <MiniBar key="o" C={C} value={r.open} max={maxOpen} />,
    r.closed,
    r.median === null ? "—" : formatMinutes(r.median),
  ]);

  if (unassigned > 0) {
    body.push([
      <span key="u" style={{ color: C.inkFaint }}>Atanmamış</span>,
      <Tag key="t" text={String(unassigned)} tone="warn" />,
      "—",
      "—",
    ]);
  }

  return <Table C={C} head={["Teknisyen", "Açık", "Kapatılan", "Ortanca süre"]} rows={body} />;
}

function Table({ C, head, rows }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sm }}>
      <thead>
        <tr>
          {head.map((h, i) => (
            <th
              key={h}
              style={{
                textAlign: i === head.length - 1 ? "right" : "left",
                fontWeight: 450,
                color: C.inkFaint,
                fontSize: T.xs,
                padding: `0 ${i === head.length - 1 ? 0 : 16}px 10px 0`,
                borderBottom: `1px solid ${C.line}`,
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
                  textAlign: i === cells.length - 1 ? "right" : "left",
                  padding: `13px ${i === cells.length - 1 ? 0 : 16}px 13px 0`,
                  borderBottom: r === rows.length - 1 ? "none" : `1px solid ${C.line}`,
                  verticalAlign: "middle",
                  color: C.ink,
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

function MiniBar({ C, value, max }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          height: 6,
          width: `${Math.max(8, (value / max) * 74)}px`,
          background: C.brand,
          borderRadius: 3,
        }}
      />
      {value}
    </span>
  );
}
