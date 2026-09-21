import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/ThemeContext";
import { F, T } from "../lib/theme";
import Shell from "../components/Shell";
import TicketDetail from "../components/TicketDetail";
import { Tag, TextInput, Empty, Skeleton, priorityTone, statusTone, railColor, timeAgo } from "../components/UI";
import { loadAttachments, loadRequirements } from "../lib/documents";
import { loadTests, checkClosure } from "../lib/tests";
import { findSimilarTickets, buildTriage } from "../lib/assistant";
import { estimateResolution } from "../lib/embeddings";
import { guard } from "../lib/session";
import { useLive } from "../lib/useLive";

const FILTERS = ["Açık", "İşlemde", "Çözüldü", "Tümü"];
const FLASH_DURATION = 7000;

export default function TechnicianPanel() {
  const { C } = useTheme();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [tickets, setTickets] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Açık");
  const [flash, setFlash] = useState(null);
  const [detail, setDetail] = useState(emptyDetail());

  useEffect(() => {
    const u = guard(navigate, ["technician"]);
    if (!u) return;
    setUser(u);
    loadTickets();
  }, [navigate]);

  const live = useLive("tickets", (payload) => {
    if (payload?.eventType === "INSERT") {
      setFlash(payload.new);
      setTimeout(() => setFlash(null), FLASH_DURATION);
    }
    loadTickets();
  });

  async function loadTickets() {
    const { data } = await supabase
      .from("tickets")
      .select("*")
      .order("created_at", { ascending: false });
    setTickets(data || []);
  }

  async function selectTicket(id) {
    setSelectedId(id);
    setDetail({ ...emptyDetail(), similarLoading: true });

    const [conversation, attachments, requirements, tests, closure] = await Promise.all([
      supabase.from("conversations").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
      loadAttachments(id),
      loadRequirements(id),
      loadTests(id),
      checkClosure(id),
    ]);

    setDetail((d) => ({
      ...d,
      conversation: conversation.data || [],
      attachments,
      requirements,
      tests,
      closure,
    }));

    // Vektör araması ve gerekçe üretimi sürüyor; sayfanın geri kalanı beklemesin
    const ticket = (tickets || []).find((t) => t.id === id);
    if (!ticket) return;

    const [similarResult, estimate] = await Promise.all([
      findSimilarTickets(ticket),
      estimateResolution({
        embedding: ticket.embedding,
        category: ticket.category,
        excludeId: ticket.id,
      }),
    ]);

    setDetail((d) => ({ ...d, similar: similarResult.items, similarLoading: false, estimate }));

    if (ticket.status !== "Çözüldü") {
      setDetail((d) => ({ ...d, triageLoading: true }));
      const triage = await buildTriage({
        ticket,
        conversation: conversation.data || [],
        similar: similarResult.items,
      });
      setDetail((d) => ({ ...d, triage, triageLoading: false }));
    }
  }

  async function refreshClosure() {
    if (!selectedId) return;
    const closure = await checkClosure(selectedId);
    setDetail((d) => ({ ...d, closure }));
  }

  if (!user) return null;

  const selected = (tickets || []).find((t) => t.id === selectedId);
  const visible = filterTickets(tickets || [], filter, search);
  const openCount = (tickets || []).filter((t) => t.status === "Açık").length;

  return (
    <Shell
      user={user}
      subtitle="çağrı yönetimi"
      wide
      right={<LiveIndicator C={C} live={live} openCount={openCount} />}
    >
      {flash && (
        <div
          style={{
            background: C.brand,
            color: C.onBrand,
            padding: "12px 16px",
            borderRadius: 8,
            fontSize: T.sm,
            marginBottom: 20,
          }}
        >
          Yeni çağrı düştü: <strong style={{ fontWeight: 500 }}>{flash.ticket_no}</strong> — {flash.title}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "360px minmax(0,1fr)", gap: 24, alignItems: "start" }}>
        <TicketList
          C={C}
          tickets={visible}
          loading={tickets === null}
          selectedId={selectedId}
          filter={filter}
          search={search}
          onSearch={setSearch}
          onFilter={setFilter}
          onSelect={selectTicket}
        />

        <div
          style={{
            background: C.surface,
            border: `1px solid ${C.line}`,
            borderRadius: 12,
            padding: selected ? "28px 34px 34px" : "48px 34px",
            minHeight: 440,
            maxHeight: "calc(100vh - 156px)",
            overflowY: "auto",
          }}
        >
          {selected ? (
            <TicketDetail
              ticket={selected}
              user={user}
              detail={detail}
              onDetailChange={(patch) => setDetail((d) => ({ ...d, ...patch }))}
              onTicketsChange={loadTickets}
              onClosureChange={refreshClosure}
            />
          ) : (
            <Empty>Soldaki listeden bir çağrı seçin.</Empty>
          )}
        </div>
      </div>
    </Shell>
  );
}

function emptyDetail() {
  return {
    conversation: [],
    attachments: [],
    requirements: [],
    tests: [],
    similar: [],
    similarLoading: false,
    estimate: null,
    triage: null,
    triageLoading: false,
    closure: { canClose: true, total: 0 },
    reqMeta: { summary: null, openQuestions: [] },
    coverageNote: null,
  };
}

function filterTickets(tickets, filter, search) {
  const query = search.toLocaleLowerCase("tr");

  return tickets.filter((t) => {
    if (filter !== "Tümü" && t.status !== filter) return false;
    if (!query) return true;

    return [t.title, t.ticket_no, t.reporter_name, t.affected_system]
      .filter(Boolean)
      .some((field) => field.toLocaleLowerCase("tr").includes(query));
  });
}

function LiveIndicator({ C, live, openCount }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        title={
          live
            ? "Canlı bağlantı kurulu, değişiklikler anında geliyor"
            : "Canlı bağlantı kurulamadı, birkaç saniyede bir yenileniyor"
        }
        style={{ width: 7, height: 7, borderRadius: "50%", background: live ? C.ok : C.warn }}
      />
      <span style={{ fontSize: T.sm, color: C.inkSoft }}>{openCount} çağrı bekliyor</span>
    </div>
  );
}

function TicketList({ C, tickets, loading, selectedId, filter, search, onSearch, onFilter, onSelect }) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
        <TextInput
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Çağrı no, başlık, kişi veya sistem ara"
          style={{ marginBottom: 11 }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => onFilter(f)}
              style={{
                fontFamily: F.body,
                fontSize: T.xs,
                fontWeight: filter === f ? 500 : 400,
                padding: "5px 10px",
                borderRadius: 6,
                border: "none",
                background: filter === f ? C.brandSoft : "transparent",
                color: filter === f ? C.brand : C.inkFaint,
                cursor: "pointer",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxHeight: "calc(100vh - 252px)", overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: 18 }}>
            <Skeleton lines={6} />
          </div>
        ) : tickets.length === 0 ? (
          <div style={{ padding: "22px 16px" }}>
            <Empty>
              {filter === "Açık"
                ? "Bekleyen çağrı yok. Kuyruk temiz."
                : "Bu filtreye uyan çağrı bulunamadı."}
            </Empty>
          </div>
        ) : (
          tickets.map((t) => (
            <TicketRow
              key={t.id}
              C={C}
              ticket={t}
              selected={selectedId === t.id}
              onClick={() => onSelect(t.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TicketRow({ C, ticket: t, selected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "14px 16px 14px 13px",
        borderBottom: `1px solid ${C.line}`,
        cursor: "pointer",
        background: selected ? C.brandTint : "transparent",
        borderLeft: `3px solid ${railColor(C, t)}`,
        transition: "background 120ms ease",
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = C.surfaceAlt;
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = "transparent";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
        <span style={{ fontFamily: F.mono, fontSize: T.xs, color: C.inkFaint }}>{t.ticket_no}</span>
        <span style={{ display: "flex", gap: 5 }}>
          {t.recurring_flag && <Tag text="Tekrar eden" tone="warn" />}
          <Tag text={t.priority} tone={priorityTone(t.priority)} />
          <Tag text={t.status} tone={statusTone(t.status)} />
        </span>
      </div>
      <div style={{ fontSize: T.sm, lineHeight: 1.5 }}>{t.title}</div>
      <div style={{ fontSize: T.xs, color: C.inkFaint, marginTop: 6 }}>
        {t.reporter_name} bildirdi, {timeAgo(t.created_at)}
      </div>
    </div>
  );
}
