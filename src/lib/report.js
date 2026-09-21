import { supabase } from "./supabase";

const DAY = 86400000;

export const PERIODS = [
  { id: "week", label: "Haftalık", days: 7 },
  { id: "month", label: "Aylık", days: 30 },
  { id: "quarter", label: "Üç aylık", days: 90 },
];

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length / 2)]);
}

function summarize({ tickets, deflections, knowledge }, start, end) {
  const inWindow = (iso) => {
    const t = new Date(iso).getTime();
    return t >= start && t < end;
  };

  const opened = tickets.filter((t) => inWindow(t.created_at));
  const closed = tickets.filter((t) => t.resolved_at && inWindow(t.resolved_at));
  const deflected = deflections.filter((d) => inWindow(d.created_at));
  const total = opened.length + deflected.length;

  const durations = closed
    .filter((t) => t.created_at)
    .map((t) => (new Date(t.resolved_at) - new Date(t.created_at)) / 60000);

  const byCategory = {};
  const bump = (name, key) => {
    if (!name) return;
    byCategory[name] = byCategory[name] || { tickets: 0, deflected: 0 };
    byCategory[name][key]++;
  };
  opened.forEach((t) => bump(t.category, "tickets"));
  deflected.forEach((d) => bump(d.category, "deflected"));

  const categories = Object.entries(byCategory)
    .map(([name, v]) => ({ name, ...v, total: v.tickets + v.deflected }))
    .sort((a, b) => b.total - a.total);

  const byType = opened.reduce((acc, t) => {
    const key = t.ticket_type || "Olay";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const byPriority = opened.reduce((acc, t) => {
    acc[t.priority] = (acc[t.priority] || 0) + 1;
    return acc;
  }, {});

  const slowest = closed
    .map((t) => ({
      ticket_no: t.ticket_no,
      title: t.title,
      category: t.category,
      minutes: Math.round((new Date(t.resolved_at) - new Date(t.created_at)) / 60000),
    }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);

  const weakKnowledge = knowledge
    .filter((k) => k.use_count >= 3 && k.success_count / k.use_count < 0.5)
    .map((k) => ({
      category: k.category,
      rate: Math.round((k.success_count / k.use_count) * 100),
      uses: k.use_count,
    }));

  return {
    total,
    opened: opened.length,
    closed: closed.length,
    deflected: deflected.length,
    deflectionRate: total ? Math.round((deflected.length / total) * 100) : 0,
    medianMinutes: median(durations),
    recurring: opened.filter((t) => t.recurring_flag).length,
    stillOpen: opened.filter((t) => t.status !== "Çözüldü").length,
    categories,
    byType,
    byPriority,
    slowest,
    weakKnowledge,
    closedList: closed
      .sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at))
      .map((t) => ({
        ticket_no: t.ticket_no,
        title: t.title,
        category: t.category,
        assignee: t.assignee,
        resolved_at: t.resolved_at,
      })),
  };
}

/**
 * Seçilen dönemi ve bir önceki eşit uzunluktaki dönemi hesaplar.
 * Rapordaki her sayı buradan gelir; modele yalnızca yorum yazdırılır.
 */
export async function buildReport(periodId) {
  const period = PERIODS.find((p) => p.id === periodId) || PERIODS[1];
  const end = Date.now();
  const start = end - period.days * DAY;
  const prevStart = start - period.days * DAY;

  const [tickets, deflections, knowledge] = await Promise.all([
    supabase.from("tickets").select("*"),
    supabase.from("deflections").select("*"),
    supabase.from("knowledge_base").select("*"),
  ]);

  const data = {
    tickets: tickets.data || [],
    deflections: deflections.data || [],
    knowledge: knowledge.data || [],
  };

  const current = summarize(data, start, end);
  const previous = summarize(data, prevStart, start);

  const fmt = (ms) =>
    new Date(ms).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const label = `${fmt(start)} – ${fmt(end)}`;

  let analysis = null;
  try {
    const { closedList, ...currentForModel } = current;
    const { closedList: _, ...previousForModel } = previous;

    const { data: result, error } = await supabase.functions.invoke("analyze", {
      body: { task: "report", period: label, current: currentForModel, previous: previousForModel },
    });
    if (error) throw error;
    if (result?.error) throw new Error(result.error);
    analysis = result;
  } catch (err) {
    console.warn("Rapor özeti üretilemedi:", err.message);
  }

  return { period, label, start, end, current, previous, analysis, generatedAt: end };
}
