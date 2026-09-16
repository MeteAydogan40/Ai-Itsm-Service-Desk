import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/ThemeContext";
import { F, shadows } from "../lib/theme";
import Shell from "../components/Shell";
import { Button, Note, Empty, percent } from "../components/UI";
import { guard } from "../lib/session";
import { useLive } from "../lib/useLive";
import { backfillEmbeddings, countMissingEmbeddings } from "../lib/embeddings";

const STEP_RANGE = [1, 2, 3, 4, 5];

export default function Dashboard() {
  const { C, mode } = useTheme();
  const S = shadows(mode);
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [deflections, setDeflections] = useState([]);
  const [knowledge, setKnowledge] = useState([]);
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
    const [t, d, k] = await Promise.all([
      supabase.from("tickets").select("*"),
      supabase.from("deflections").select("*"),
      supabase.from("knowledge_base").select("*"),
    ]);
    setTickets(t.data || []);
    setDeflections(d.data || []);
    setKnowledge(k.data || []);
    setMissing(await countMissingEmbeddings());
  }

  async function runBackfill() {
    setBackfilling({ kb: 0, tickets: 0, failed: 0, phase: "Başlıyor" });
    const report = await backfillEmbeddings(setBackfilling);
    setBackfilling({ ...report, phase: "Tamamlandı" });
    await load();
    setTimeout(() => setBackfilling(null), 4000);
  }

  if (!user) return null;

  const stats = computeStats({ tickets, deflections, knowledge });
  const vectorsReady = missing.kb === 0 && missing.tickets === 0;

  return (
    <Shell user={user} subtitle="özet">
      {!vectorsReady && (
        <Note tone="warn" style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              Semantik arama için eksik vektör var
            </div>
            <div style={{ fontSize: 13, color: C.inkSoft }}>
              {missing.kb} bilgi bankası kaydı ve {missing.tickets} çağrı henüz
              vektörlenmedi. Bunlar semantik aramada bulunamaz.
            </div>
          </div>
          <Button onClick={runBackfill} disabled={!!backfilling}>
            {backfilling
              ? `${backfilling.phase}: ${backfilling.kb + backfilling.tickets} kayıt`
              : "Eksikleri tamamla"}
          </Button>
        </Note>
      )}

      {backfilling?.phase === "Tamamlandı" && (
        <Note tone="brand" style={{ marginBottom: 18 }}>
          Vektörleme tamamlandı: {backfilling.kb} bilgi bankası kaydı,{" "}
          {backfilling.tickets} çağrı
          {backfilling.failed > 0 && `, ${backfilling.failed} başarısız`}.
        </Note>
      )}

      <Hero C={C} S={S} stats={stats} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <Metric C={C} S={S} value={stats.open} label="bekleyen çağrı" />
        <Metric C={C} S={S} value={stats.inProgress} label="üzerinde çalışılan" />
        <Metric C={C} S={S} value={stats.avgResolution} label="ortalama çözüm süresi" />
        <Metric C={C} S={S} value={stats.technicianContributions} label="teknisyen katkısı" />
        <Metric C={C} S={S} value={stats.recurring} label="tekrarlayan işaretli" />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)",
          gap: 18,
          marginBottom: 18,
        }}
      >
        <Card C={C} S={S} title="Kategoriler" note="Koyu kısım teknik ekibe düşen, açık kısım öneriyle çözülen">
          {stats.categories.length === 0 ? (
            <Empty>Henüz veri yok.</Empty>
          ) : (
            stats.categories.map((c) => (
              <div key={c.name} style={{ marginBottom: 15 }}>
                <BarLabel C={C} left={c.name} right={c.total} />
                <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: C.surfaceSunken }}>
                  <div style={{ width: `${(c.tickets / stats.maxCategory) * 100}%`, background: C.brand }} />
                  <div style={{ width: `${(c.deflected / stats.maxCategory) * 100}%`, background: C.brandSoft }} />
                </div>
              </div>
            ))
          )}
        </Card>

        <Card
          C={C}
          S={S}
          title="Öneriler kaçıncı adımda işe yaradı"
          note="Erken adımlar, önerilerin isabetli olduğunu gösterir"
        >
          {deflections.length === 0 ? (
            <Empty>Henüz öneriyle çözülen sorun yok.</Empty>
          ) : (
            stats.stepDistribution.map((s) => (
              <div key={s.step} style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 11 }}>
                <span style={{ fontSize: 12.5, color: C.inkFaint, width: 52, flexShrink: 0 }}>
                  {s.step}. adım
                </span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: C.surfaceSunken }}>
                  <div
                    style={{
                      width: `${(s.count / stats.maxStep) * 100}%`,
                      height: "100%",
                      borderRadius: 4,
                      background: C.brand,
                    }}
                  />
                </div>
                <span style={{ fontSize: 12.5, color: C.inkSoft, width: 20, textAlign: "right" }}>
                  {s.count}
                </span>
              </div>
            ))
          )}
        </Card>
      </div>

      <Card
        C={C}
        S={S}
        title="Bilgi bankası kayıtlarının başarı oranı"
        note="Bu oranlar yapay zekanın tahmini değil, gerçek sayımdır: kayıt kaç kez önerildi, kaçında kullanıcı sorunun çözüldüğünü bildirdi"
      >
        {stats.usedKnowledge.length === 0 ? (
          <Empty>
            Henüz yeterli kullanım verisi yok. Öneriler kullanıldıkça bu liste dolacak.
          </Empty>
        ) : (
          stats.usedKnowledge.map((k) => (
            <div key={k.id} style={{ marginBottom: 14 }}>
              <BarLabel
                C={C}
                left={
                  <>
                    {k.category}
                    {k.source === "technician" && (
                      <span style={{ color: C.inkFaint, fontSize: 12 }}> · teknisyen çözümü</span>
                    )}
                  </>
                }
                right={`${k.success_count}/${k.use_count} · %${k.rate}`}
              />
              <div style={{ height: 8, borderRadius: 4, background: C.surfaceSunken }}>
                <div
                  style={{
                    width: `${k.rate}%`,
                    height: "100%",
                    borderRadius: 4,
                    background: k.rate >= 60 ? C.brand : k.rate >= 30 ? C.warn : C.danger,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </Card>
    </Shell>
  );
}

function computeStats({ tickets, deflections, knowledge }) {
  const total = tickets.length + deflections.length;

  const resolved = tickets.filter((t) => t.resolved_at && t.created_at);
  const avgMinutes = resolved.length
    ? Math.round(
        resolved.reduce((sum, t) => sum + (new Date(t.resolved_at) - new Date(t.created_at)) / 60000, 0) /
          resolved.length,
      )
    : null;

  const byCategory = {};
  const bump = (name, key) => {
    byCategory[name] = byCategory[name] || { tickets: 0, deflected: 0 };
    byCategory[name][key]++;
  };
  tickets.forEach((t) => bump(t.category, "tickets"));
  deflections.forEach((d) => bump(d.category, "deflected"));

  const categories = Object.entries(byCategory)
    .map(([name, v]) => ({ name, ...v, total: v.tickets + v.deflected }))
    .sort((a, b) => b.total - a.total);

  const stepDistribution = STEP_RANGE.map((step) => ({
    step,
    count: deflections.filter((d) => d.resolved_at_step === step).length,
  }));

  const usedKnowledge = knowledge
    .filter((k) => k.use_count > 0)
    .map((k) => ({ ...k, rate: percent(k.success_count, k.use_count) }))
    .sort((a, b) => b.use_count - a.use_count)
    .slice(0, 6);

  return {
    total,
    deflected: deflections.length,
    ticketCount: tickets.length,
    deflectionRate: percent(deflections.length, total) ?? 0,
    open: tickets.filter((t) => t.status === "Açık").length,
    inProgress: tickets.filter((t) => t.status === "İşlemde").length,
    recurring: tickets.filter((t) => t.recurring_flag).length,
    avgResolution:
      avgMinutes === null ? "—" : avgMinutes < 60 ? `${avgMinutes} dk` : `${Math.round(avgMinutes / 60)} sa`,
    technicianContributions: knowledge
      .filter((k) => k.source === "technician")
      .flatMap((k) => k.steps || []).length,
    categories,
    maxCategory: Math.max(1, ...categories.map((c) => c.total)),
    stepDistribution,
    maxStep: Math.max(1, ...stepDistribution.map((s) => s.count)),
    usedKnowledge,
  };
}

function Hero({ C, S, stats }) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 18,
        boxShadow: S.lift,
        padding: "34px 34px 30px",
        marginBottom: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", gap: 18, flexWrap: "wrap" }}>
        <div
          style={{
            fontFamily: F.display,
            fontSize: 78,
            fontWeight: 700,
            letterSpacing: "-0.05em",
            lineHeight: 0.85,
            color: C.brand,
          }}
        >
          %{stats.deflectionRate}
        </div>
        <div style={{ paddingBottom: 6, maxWidth: "40ch" }}>
          <div style={{ fontSize: 15.5, fontWeight: 600, color: C.ink }}>
            Sorunlar çağrı açılmadan çözüldü
          </div>
          <div style={{ fontSize: 13.5, color: C.inkSoft, marginTop: 5, lineHeight: 1.55 }}>
            Toplam {stats.total} bildirimden {stats.deflected} tanesi asistanın
            önerileriyle çözüldü, {stats.ticketCount} tanesi teknik ekibe düştü.
          </div>
        </div>
      </div>
    </div>
  );
}

function BarLabel({ C, left, right }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        fontSize: 13,
        marginBottom: 6,
        gap: 12,
      }}
    >
      <span style={{ color: C.ink }}>{left}</span>
      <span style={{ color: C.inkFaint, fontSize: 12.5, whiteSpace: "nowrap" }}>{right}</span>
    </div>
  );
}

function Metric({ C, S, value, label }) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 13,
        boxShadow: S.flat,
        padding: "17px 19px",
      }}
    >
      <div
        style={{
          fontFamily: F.display,
          fontSize: 29,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          color: C.ink,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12.5, color: C.inkFaint, marginTop: 7 }}>{label}</div>
    </div>
  );
}

function Card({ C, S, title, note, children }) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 14,
        boxShadow: S.flat,
        padding: "20px 22px 22px",
      }}
    >
      <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>{title}</div>
      {note && (
        <div
          style={{
            fontSize: 12.5,
            color: C.inkFaint,
            marginTop: 5,
            marginBottom: 18,
            lineHeight: 1.5,
            maxWidth: "70ch",
          }}
        >
          {note}
        </div>
      )}
      {children}
    </div>
  );
}
