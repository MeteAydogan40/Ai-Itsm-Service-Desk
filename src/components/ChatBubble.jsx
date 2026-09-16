import React from "react";
import { useTheme } from "../lib/ThemeContext";
import { F } from "../lib/theme";
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
        <StepBubble
          C={C}
          message={m}
          session={session}
          active={activeStep}
          onResult={onStepResult}
        />
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
        gap: 6,
      }}
    >
      <div
        style={{
          maxWidth: "70%",
          fontSize: 14.5,
          lineHeight: 1.58,
          padding: "11px 15px",
          borderRadius: isUser ? "13px 13px 4px 13px" : "13px 13px 13px 4px",
          background: isUser ? C.brand : C.surfaceAlt,
          color: isUser ? C.onBrand : C.ink,
          border: isUser ? "none" : `1px solid ${C.line}`,
        }}
      >
        {m.text}
      </div>
      {m.attachments && (
        <div style={{ maxWidth: "70%" }}>
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
        <div style={{ fontSize: 12.5, color: C.info, fontWeight: 600, marginBottom: 7 }}>
          Ekran görüntüsünden okuduklarım
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
          {file.extracted_text}
        </div>
        <div style={{ fontSize: 11.5, color: C.inkSoft, marginTop: 9 }}>
          Yanlış okuduysam yazarak düzeltebilirsiniz.
        </div>
      </Note>
    </div>
  );
}

function RecurringBubble({ info }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <Note tone="warn" style={{ maxWidth: "76%", fontSize: 13.5 }}>
        Son 24 saatte buna benzer <strong>{info.count} bildirim</strong> daha geldi.
        Bu genel bir arıza olabilir; teknik ekip zaten haberdar olabilir. Yine de
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
          maxWidth: "78%",
          border: `1px solid ${C.line}`,
          borderLeft: `3px solid ${C.warn}`,
          borderRadius: "11px 13px 13px 4px",
          padding: "13px 16px",
          background: C.surface,
        }}
      >
        <div style={{ fontSize: 11.5, color: C.inkFaint, marginBottom: 7 }}>
          {m.stepIndex + 1}. adım, toplam {steps.length}
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.55 }}>{step.text}</div>

        {source && <SourceNote C={C} source={source} />}

        {active && (
          <div style={{ display: "flex", gap: 8, marginTop: 13 }}>
            <Button variant="soft" onClick={() => onResult(true)} style={{ padding: "7px 13px", fontSize: 13 }}>
              Sorun çözüldü
            </Button>
            <Button variant="ghost" onClick={() => onResult(false)} style={{ padding: "7px 13px", fontSize: 13 }}>
              Denedim, olmadı
            </Button>
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
        marginTop: 10,
        paddingTop: 9,
        borderTop: `1px dashed ${C.line}`,
        fontSize: 11.5,
        color: C.inkFaint,
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
      }}
    >
      <span>
        Kaynak: {source.category}
        {source.source === "technician" ? " (teknisyen çözümü)" : " (bilgi bankası)"}
      </span>
      <span style={{ color: C.brand }}>eşleşme {Math.round(source.similarity * 100)}%</span>
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
      <Note tone="brand" style={{ maxWidth: "78%" }}>
        <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 5 }}>
          {m.isRequest ? "Talep kaydı oluşturuldu" : "Çağrı oluşturuldu"}
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 15, fontWeight: 600, color: C.brand }}>
          {m.ticketNo}
        </div>
        <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 7, lineHeight: 1.55 }}>
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
          background: C.surfaceAlt,
          border: `1px solid ${C.line}`,
          borderRadius: "13px 13px 13px 4px",
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
