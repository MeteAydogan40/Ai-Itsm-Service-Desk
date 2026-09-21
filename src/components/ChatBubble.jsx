import React from "react";
import { useTheme } from "../lib/ThemeContext";
import { F, T } from "../lib/theme";
import { Button, Note } from "./UI";
import { AttachmentList } from "./Attachments";

export function ChatBubble({ message: m, session, activeStep, onStepResult }) {
  const { C } = useTheme();

  switch (m.type) {
    case "text":
      return <TextBubble C={C} message={m} />;
    case "vision":
      return <VisionBubble C={C} file={m.file} />;
    case "recurring":
      return <RecurringBubble info={m.info} />;
    case "step":
      return (
        <StepBubble C={C} message={m} session={session} active={activeStep} onResult={onStepResult} />
      );
    case "ticket":
      return <TicketBubble C={C} message={m} />;
    default:
      return null;
  }
}

function TextBubble({ C, message: m }) {
  const isUser = m.from === "user";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        gap: 7,
      }}
    >
      <div
        style={{
          maxWidth: "72%",
          fontSize: T.sm,
          lineHeight: 1.65,
          padding: "11px 15px",
          borderRadius: isUser ? "11px 11px 3px 11px" : "11px 11px 11px 3px",
          background: isUser ? C.brand : C.surface,
          color: isUser ? C.onBrand : C.ink,
          border: isUser ? "none" : `1px solid ${C.line}`,
        }}
      >
        {m.text}
      </div>
      {m.attachments && (
        <div style={{ maxWidth: "72%" }}>
          <AttachmentList items={m.attachments} compact />
        </div>
      )}
    </div>
  );
}

// Modelin görselde ne okuduğunu kullanıcıya teyit ettiriyoruz;
// yanlış okuduysa sessizce varsaymak yerine düzeltme şansı veriyor
function VisionBubble({ C, file }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <Note tone="info" style={{ maxWidth: "78%" }}>
        <div style={{ fontSize: T.xs, color: C.brand, fontWeight: 500, marginBottom: 8 }}>
          Ekran görüntüsünden okuduklarım
        </div>
        <div style={{ fontSize: T.sm, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
          {file.extracted_text}
        </div>
        <div style={{ fontSize: T.xs, color: C.inkSoft, marginTop: 10 }}>
          Yanlış okuduysam yazarak düzeltebilirsiniz.
        </div>
      </Note>
    </div>
  );
}

function RecurringBubble({ info }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <Note tone="warn" style={{ maxWidth: "78%" }}>
        Son 24 saatte buna benzer <strong style={{ fontWeight: 500 }}>{info.count} bildirim</strong> daha
        geldi. Bu genel bir arıza olabilir; teknik ekip zaten haberdar olabilir. Yine de
        adımları birlikte deneyelim.
      </Note>
    </div>
  );
}

function StepBubble({ C, message: m, session, active, onResult }) {
  const steps = session?.steps || [];
  const step = steps[m.stepIndex];
  if (!step) return null;

  const source = session?.sources?.find((s) => s.id === step.sourceId);

  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div
        style={{
          maxWidth: "80%",
          border: `1px solid ${C.line}`,
          borderLeft: `3px solid ${C.warn}`,
          borderRadius: "9px 11px 11px 3px",
          padding: "14px 17px",
          background: C.surface,
        }}
      >
        <div style={{ fontSize: T.xs, color: C.inkFaint, marginBottom: 8 }}>
          {m.stepIndex + 1}. adım, toplam {steps.length}
        </div>
        <div style={{ fontSize: T.sm, lineHeight: 1.65 }}>{step.text}</div>

        {source && <SourceNote C={C} source={source} />}

        {active && (
          <div style={{ display: "flex", gap: 8, marginTop: 15 }}>
            <Button onClick={() => onResult(true)}>Sorun çözüldü</Button>
            <Button variant="outline" onClick={() => onResult(false)}>Denedim, olmadı</Button>
          </div>
        )}
      </div>
    </div>
  );
}

// Her iki oran da ölçülmüş: eşleşme kosinüs benzerliğinden,
// başarı kullanım sayacından geliyor
function SourceNote({ C, source }) {
  const rate =
    source.use_count > 0 ? Math.round((source.success_count / source.use_count) * 100) : null;

  return (
    <div
      style={{
        marginTop: 12,
        paddingTop: 11,
        borderTop: `1px solid ${C.line}`,
        fontSize: T.xs,
        color: C.inkFaint,
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "center",
      }}
    >
      <span>
        Kaynak: {source.category}
        {source.source === "technician" ? " (teknisyen çözümü)" : " (bilgi bankası)"}
      </span>
      <span style={{ color: C.brand }}>eşleşme %{Math.round(source.similarity * 100)}</span>
      {rate !== null && (
        <span>
          geçmişte {source.use_count} denemenin {source.success_count} tanesinde işe yaradı
        </span>
      )}
    </div>
  );
}

function TicketBubble({ C, message: m }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <Note tone="ok" style={{ maxWidth: "80%" }}>
        <div style={{ fontSize: T.xs, color: C.inkSoft, marginBottom: 6 }}>
          {m.isRequest ? "Talep kaydı oluşturuldu" : "Çağrı oluşturuldu"}
        </div>
        <div style={{ fontFamily: F.mono, fontSize: T.base, fontWeight: 500, color: C.ok }}>
          {m.ticketNo}
        </div>
        <div style={{ fontSize: T.xs, color: C.inkSoft, marginTop: 9, lineHeight: 1.6 }}>
          {m.supportGroup && `${m.supportGroup} ekibine yönlendirildi. `}
          {m.hasDocs
            ? "Eklediğiniz doküman da kayda iliştirildi; ekip gereksinimleri buradan çıkaracak."
            : "Sağdaki listeden durumunu takip edebilirsiniz."}
        </div>
      </Note>
    </div>
  );
}

export function TypingDots() {
  const { C } = useTheme();
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "14px 16px",
          background: C.surface,
          border: `1px solid ${C.line}`,
          borderRadius: "11px 11px 11px 3px",
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: C.inkFaint,
              animation: `dot 1.2s ${i * 0.16}s infinite ease-in-out`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
