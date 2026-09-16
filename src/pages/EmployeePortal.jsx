import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/ThemeContext";
import { F, shadows } from "../lib/theme";
import Shell from "../components/Shell";
import { ChatBubble, TypingDots } from "../components/ChatBubble";
import { Tag, Button, Empty, statusTone, timeAgo } from "../components/UI";
import { useAttachments, AttachButton, DropOverlay, AttachmentList } from "../components/Attachments";
import { analyzeProblem, suggestSteps, generateTicketNo, VOICE } from "../lib/assistant";
import { embedTicket, bumpKnowledgeUsage } from "../lib/embeddings";
import { linkAttachmentsToTicket } from "../lib/documents";
import { guard } from "../lib/session";
import { useLive } from "../lib/useLive";

const STARTERS = [
  "İnternete bağlanamıyorum",
  "Yazıcı çıktı vermiyor",
  "Şifremi girince hesabım kilitleniyor",
  "Bilgisayarım çok yavaşladı",
  "Teams toplantısında sesim gitmiyor",
  "SAP'ta yeni bir kontrol eklenmesini istiyoruz",
];

// Anında cevap robotik hissettiriyor; kısa gecikmeler sohbeti canlı tutuyor
const DELAY = { ack: 800, question: 950, beforeSteps: 700, step: 420, nextStep: 650, close: 950 };

const PLACEHOLDERS = {
  ask: "Sorununuzu yazın, dosya sürükleyin veya ekran görüntüsü yapıştırın",
  followup: "Cevabınızı yazın",
  steps: "Yukarıdaki adımı deneyip sonucu işaretleyin",
  done: "Yeni konu bildirmek için yukarıdaki düğmeye basın",
};

export default function EmployeePortal() {
  const { C, mode } = useTheme();
  const S = shadows(mode);
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [phase, setPhase] = useState("ask");
  const [session, setSession] = useState(null);
  const [myTickets, setMyTickets] = useState([]);
  // Giriş alanı temizlendikten sonra da çağrıya bağlanacak
  // dosyaları bilmemiz gerekiyor
  const [sentAttachments, setSentAttachments] = useState([]);

  const scrollRef = useRef(null);
  const chatBoxRef = useRef(null);

  const attach = useAttachments({
    ticketId: null,
    uploadedBy: user?.name,
    dropZoneRef: chatBoxRef,
  });

  useEffect(() => {
    const u = guard(navigate, ["employee"]);
    if (!u) return;
    setUser(u);
    setMessages([{ from: "bot", type: "text", text: VOICE.greeting() }]);
    loadMyTickets(u.name);
  }, [navigate]);

  useLive("tickets", () => {
    if (user) loadMyTickets(user.name);
  });

  // scrollIntoView üst katmanları da kaydırıp sayfayı hareket ettiriyor
  useEffect(() => {
    const box = scrollRef.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  async function loadMyTickets(name) {
    const { data } = await supabase
      .from("tickets")
      .select("*")
      .eq("reporter_name", name)
      .order("created_at", { ascending: false });
    setMyTickets(data || []);
  }

  const push = (msg) => setMessages((prev) => [...prev, msg]);

  function botSay(msg, delay) {
    setTyping(true);
    return new Promise((resolve) => {
      setTimeout(() => {
        setTyping(false);
        push(msg);
        resolve();
      }, delay);
    });
  }

  async function send(textOverride) {
    const text = (textOverride ?? input).trim();
    if ((!text && !attach.items.length) || typing) return;

    const attached = attach.items.filter((a) => !a.pending);
    push({
      from: "user",
      type: "text",
      text: text || "(dosya eklendi)",
      attachments: attached.length ? attached : undefined,
    });
    setInput("");

    // Dosyalar sohbete geçti; giriş alanında bırakmak hem tekrar
    // hem de "gönderildi mi" belirsizliği yaratıyor
    if (attached.length) setSentAttachments((prev) => [...prev, ...attached]);
    attach.setItems([]);

    if (phase === "ask") await handleProblem(text, attached);
    else if (phase === "followup") await handleFollowUp(text);
  }

  async function handleProblem(text, attachedFiles) {
    // Ekran görüntüsünden okunan hata mesajı da sınıflandırmaya giriyor
    const extracted = attachedFiles
      .filter((a) => a.extracted_text)
      .map((a) => `[${a.file_name}]\n${a.extracted_text}`)
      .join("\n\n");

    const fullText = extracted ? `${text}\n\n--- Ekli dosyalardan ---\n${extracted}` : text;

    setTyping(true);
    const analysis = await analyzeProblem(fullText);
    setTyping(false);

    setSession({
      problemText: text || "(dosya eklendi)",
      fullText,
      attachedFiles,
      ...analysis,
      steps: [],
      sources: [],
      stepIndex: 0,
    });

    await botSay(
      { from: "bot", type: "text", text: VOICE.acknowledge(analysis.category, analysis.frustrated) },
      DELAY.ack,
    );

    const imageRead = attachedFiles.find((f) => f.kind === "image" && f.extracted_text);
    if (imageRead) await botSay({ from: "bot", type: "vision", file: imageRead }, DELAY.beforeSteps);

    if (analysis.recurring) {
      await botSay({ from: "bot", type: "recurring", info: analysis.recurring }, DELAY.beforeSteps);
    }

    await botSay({ from: "bot", type: "text", text: analysis.followUpQuestion }, DELAY.question);
    setPhase("followup");
  }

  // Bir talepte denenecek bir şey yok; arıza giderme adımları yalnızca olaylara ait
  async function handleFollowUp(answer) {
    const request = session.type === "Talep" || session.type === "Değişiklik";

    if (request) {
      await botSay(
        {
          from: "bot",
          type: "text",
          text:
            "Teşekkürler. Bu bir geliştirme talebi olduğu için doğrudan ilgili ekibe " +
            "iletiyorum; denemeniz gereken bir şey yok.",
        },
        DELAY.ack,
      );
      setSession((s) => ({ ...s, followUpAnswer: answer }));
      await createTicket({ isRequest: true });
      return;
    }

    await botSay({ from: "bot", type: "text", text: VOICE.beforeSteps() }, DELAY.beforeSteps);

    setTyping(true);
    const { steps, sources } = await suggestSteps({
      text: session.problemText,
      followUpAnswer: answer,
      category: session.category,
      queryEmbedding: session.queryEmbedding,
    });
    setTyping(false);

    setSession((s) => ({ ...s, followUpAnswer: answer, steps, sources, stepIndex: 0 }));
    await botSay({ from: "bot", type: "step", stepIndex: 0 }, DELAY.step);
    setPhase("steps");
  }

  async function handleStepResult(worked) {
    if (!session || typing) return;

    const { steps, stepIndex } = session;
    const current = steps[stepIndex];

    if (current?.sourceId) bumpKnowledgeUsage(current.sourceId, worked);

    if (worked) {
      push({ from: "user", type: "text", text: "Bu işe yaradı." });
      await botSay({ from: "bot", type: "text", text: VOICE.solved() }, DELAY.ack);
      setPhase("done");

      await supabase.from("deflections").insert({
        problem_text: session.problemText,
        category: session.category,
        resolved_at_step: stepIndex + 1,
        source_kb_id: current?.sourceId || null,
      });
      return;
    }

    push({ from: "user", type: "text", text: "Denedim, olmadı." });
    const next = stepIndex + 1;

    if (next < steps.length) {
      setSession((s) => ({ ...s, stepIndex: next }));
      await botSay({ from: "bot", type: "text", text: VOICE.nextStep() }, DELAY.nextStep);
      await botSay({ from: "bot", type: "step", stepIndex: next }, DELAY.step);
    } else {
      await createTicket();
    }
  }

  async function createTicket({ isRequest = false } = {}) {
    const ticketNo = generateTicketNo();
    if (!isRequest) await botSay({ from: "bot", type: "text", text: VOICE.escalate() }, DELAY.close);

    const { data, error } = await supabase
      .from("tickets")
      .insert({
        ticket_no: ticketNo,
        reporter_name: user.name,
        title: session.summary || session.problemText.slice(0, 90),
        description: session.problemText,
        ticket_type: session.type || "Olay",
        category: session.category,
        sub_category: session.subCategory || null,
        affected_system: session.affectedSystem || null,
        support_group: session.supportGroup || null,
        impact: session.impact || "Orta",
        priority: session.priority,
        priority_reason: session.priorityReason || null,
        status: "Açık",
        tried_steps: session.steps.map((s) => s.text),
        source_kb_ids: [...new Set(session.steps.map((s) => s.sourceId).filter(Boolean))],
        recurring_flag: !!session.recurring,
        recurring_note: session.recurring
          ? `Son 24 saatte benzer ${session.recurring.count} çağrı açıldı.`
          : null,
      })
      .select()
      .single();

    if (error) {
      push({ from: "bot", type: "text", text: "Çağrı kaydedilemedi. Tekrar dener misiniz?" });
      return;
    }

    const history = messages
      .filter((m) => m.type === "text")
      .map((m) => ({ ticket_id: data.id, role: m.from, content: m.text }));
    if (history.length) await supabase.from("conversations").insert(history);

    const attachmentIds = sentAttachments.map((a) => a.id);
    if (attachmentIds.length) await linkAttachmentsToTicket(attachmentIds, data.id);

    // Vektör arka planda üretiliyor; bu çağrı gelecekte
    // "benzer geçmiş çağrı" olarak bulunabilecek
    embedTicket(data);

    push({
      from: "bot",
      type: "ticket",
      ticketNo,
      hasDocs: attachmentIds.length > 0,
      isRequest,
      supportGroup: session.supportGroup,
    });
    setPhase("done");
    loadMyTickets(user.name);
  }

  function reset() {
    setMessages([{ from: "bot", type: "text", text: VOICE.greeting() }]);
    setSession(null);
    setPhase("ask");
    setSentAttachments([]);
    attach.setItems([]);
  }

  if (!user) return null;

  const locked = phase === "steps" || phase === "done" || typing;
  const showStarters = phase === "ask" && messages.length === 1 && !typing;

  return (
    <Shell user={user} subtitle="sorun bildirme">
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 292px", gap: 20, alignItems: "start" }}>
        <div
          ref={chatBoxRef}
          style={{
            position: "relative",
            background: C.surface,
            border: `1px solid ${C.line}`,
            borderRadius: 16,
            boxShadow: S.lift,
            display: "flex",
            flexDirection: "column",
            height: "calc(100vh - 156px)",
            minHeight: 500,
            overflow: "hidden",
          }}
        >
          <DropOverlay visible={attach.dragging} />

          <ChatHeader C={C} session={session} phase={phase} onReset={reset} />

          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 22,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {messages.map((m, i) => (
              <ChatBubble
                key={i}
                message={m}
                session={session}
                activeStep={
                  m.type === "step" &&
                  phase === "steps" &&
                  session?.stepIndex === m.stepIndex &&
                  i === messages.length - 1
                }
                onStepResult={handleStepResult}
              />
            ))}

            {typing && <TypingDots />}

            {showStarters && <Starters C={C} onPick={send} />}
          </div>

          <ChatInput
            C={C}
            value={input}
            onChange={setInput}
            onSend={send}
            placeholder={PLACEHOLDERS[phase]}
            locked={locked}
            attach={attach}
          />
        </div>

        <MyTickets C={C} S={S} tickets={myTickets} />
      </div>
    </Shell>
  );
}

function ChatHeader({ C, session, phase, onReset }) {
  return (
    <div
      style={{
        padding: "14px 22px",
        borderBottom: `1px solid ${C.line}`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.brand }} />
      <span style={{ fontSize: 14.5, fontWeight: 600 }}>Destek asistanı</span>
      {session?.type && session.type !== "Olay" && <Tag text={session.type} tone="info" />}
      {session?.category && <Tag text={session.category} tone="neutral" />}
      {session?.priority === "Yüksek" && <Tag text="Yüksek öncelik" tone="danger" />}
      {phase === "done" && (
        <Button
          variant="ghost"
          onClick={onReset}
          style={{ marginLeft: "auto", padding: "6px 12px", fontSize: 13 }}
        >
          Yeni konu bildir
        </Button>
      )}
    </div>
  );
}

function Starters({ C, onPick }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 13, color: C.inkFaint, marginBottom: 11 }}>Sık bildirilen konular</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {STARTERS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            style={{
              fontFamily: F.body,
              fontSize: 13.5,
              padding: "8px 13px",
              borderRadius: 20,
              border: `1px solid ${C.line}`,
              background: C.surfaceAlt,
              color: C.inkSoft,
              cursor: "pointer",
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatInput({ C, value, onChange, onSend, placeholder, locked, attach }) {
  return (
    <div style={{ borderTop: `1px solid ${C.line}`, padding: "12px 22px 14px", background: C.surfaceAlt }}>
      {attach.items.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <AttachmentList items={attach.items} onRemove={attach.remove} />
        </div>
      )}

      {attach.error && (
        <div style={{ fontSize: 12.5, color: C.danger, marginBottom: 9 }}>{attach.error}</div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <AttachButton onFiles={attach.addFiles} disabled={locked || attach.busy} />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          disabled={locked}
          placeholder={placeholder}
          style={{
            flex: 1,
            fontFamily: F.body,
            fontSize: 14.5,
            padding: "11px 14px",
            borderRadius: 9,
            border: `1px solid ${C.lineStrong}`,
            outline: "none",
            background: locked ? C.surfaceSunken : C.surface,
            color: C.ink,
          }}
        />
        <Button
          onClick={() => onSend()}
          disabled={locked || attach.busy || (!value.trim() && !attach.items.length)}
        >
          Gönder
        </Button>
      </div>
    </div>
  );
}

function MyTickets({ C, S, tickets }) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 14,
        boxShadow: S.flat,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        maxHeight: "calc(100vh - 156px)",
      }}
    >
      <div
        style={{
          padding: "13px 17px",
          borderBottom: `1px solid ${C.line}`,
          fontSize: 13.5,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        Çağrılarım
        {tickets.length > 0 && (
          <span style={{ color: C.inkFaint, fontWeight: 400 }}> · {tickets.length}</span>
        )}
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        {tickets.length === 0 ? (
          <div style={{ padding: "18px 17px" }}>
            <Empty>Henüz çağrınız yok. Çoğu sorun soldaki adımlarla çözülüyor.</Empty>
          </div>
        ) : (
          tickets.map((t) => (
            <div key={t.id} style={{ padding: "13px 17px", borderBottom: `1px solid ${C.line}` }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.inkFaint }}>
                  {t.ticket_no}
                </span>
                <Tag text={t.status} tone={statusTone(t.status)} />
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{t.title}</div>
              <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 5 }}>
                {timeAgo(t.created_at)}
              </div>
              {t.resolution_note && (
                <div
                  style={{
                    marginTop: 9,
                    padding: "9px 11px",
                    background: C.brandTint,
                    borderRadius: 7,
                    fontSize: 12.5,
                    color: C.inkSoft,
                    lineHeight: 1.55,
                  }}
                >
                  {t.resolution_note}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
