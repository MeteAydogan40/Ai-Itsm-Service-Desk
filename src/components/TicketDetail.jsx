import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/ThemeContext";
import { F, T } from "../lib/theme";
import {
  Tag, Button, Block, Note, Empty, Skeleton, TextArea, Checkbox,
  priorityTone, statusTone, clockTime, duration, formatMinutes,
} from "./UI";
import { useToast } from "./Toast";
import { AttachmentList } from "./Attachments";
import Requirements from "./Requirements";
import TestCases from "./TestCases";
import { buildChecklist } from "../lib/assistant";
import { embed } from "../lib/embeddings";
import { extractRequirements } from "../lib/documents";
import { generateTests, loadTests } from "../lib/tests";

// ITSM'de Incident ve Service Request ayrı süreçlerdir; aynı
// kelimeleri kullanmak ikisini tek süreç gibi gösteriyor
const WORDING = {
  incident: {
    take: "Çağrıyı üstlen",
    taken: "üstlendi",
    resolve: "Çöz ve kullanıcıya bildir",
    opened: "Çağrı açıldı",
    noteLabel: "Çözüm notu",
    notePlaceholder:
      "Ne yaptınız? Bu not bilgi bankasına eklenir ve benzer sorunlarda çalışana öneri olarak gösterilir.",
    resolvedLabel: "Uygulanan çözüm",
    checklistBtn: "Kapatmadan önce kontrol listesi oluştur",
    timelineTake: "Üstlenilmedi",
    timelineDone: "Çözüldü",
  },
  request: {
    take: "Talebi analize al",
    taken: "analize aldı",
    resolve: "Analizi tamamla ve geliştirmeye aktar",
    opened: "Talep açıldı",
    noteLabel: "Analiz notu",
    notePlaceholder:
      "Analiz sonucu, efor tahmini, geliştirme ekibine iletilecek notlar. Bu not bilgi bankasına da eklenir.",
    resolvedLabel: "Analiz sonucu",
    checklistBtn: "Aktarmadan önce kontrol listesi oluştur",
    timelineTake: "Analize alınmadı",
    timelineDone: "Aktarıldı",
  },
};

const isRequest = (t) => t?.ticket_type === "Talep" || t?.ticket_type === "Değişiklik";
const wordingFor = (t) => (isRequest(t) ? WORDING.request : WORDING.incident);

export default function TicketDetail({ ticket, user, detail, onDetailChange, onTicketsChange, onClosureChange }) {
  const { C } = useTheme();
  const notify = useToast();

  const [note, setNote] = useState("");
  const [checklist, setChecklist] = useState(null);
  const [kbDraft, setKbDraft] = useState(null);
  const [checked, setChecked] = useState({});
  const [busy, setBusy] = useState({});
  const [errors, setErrors] = useState({});

  const w = wordingFor(ticket);
  // Onaylanan gereksinimler test senaryolarının kaynağı olacak;
  // sorumluluk belirsiz kalmamalı
  const isOwner = !!ticket.assignee && ticket.assignee === user.name;

  const setFlag = (k, v) => setBusy((b) => ({ ...b, [k]: v }));
  const setError = (k, v) => setErrors((e) => ({ ...e, [k]: v }));

  async function take() {
    await supabase
      .from("tickets")
      .update({ status: "İşlemde", assignee: user.name, taken_at: new Date().toISOString() })
      .eq("id", ticket.id);
    onTicketsChange();
    notify(isRequest(ticket) ? "Talep analize alındı" : "Çağrı üstlenildi");
  }

  async function runExtraction() {
    setFlag("requirements", true);
    setError("requirements", null);
    const result = await extractRequirements({ ticket, attachments: detail.attachments });
    setFlag("requirements", false);

    if (result.error) return setError("requirements", result.error);
    onDetailChange({
      requirements: result.requirements,
      reqMeta: { summary: result.summary, openQuestions: result.openQuestions },
    });
    notify(`${result.requirements.length} gereksinim çıkarıldı`);
  }

  async function runTestGeneration() {
    setFlag("tests", true);
    setError("tests", null);
    const result = await generateTests({ ticket, requirements: detail.requirements });
    setFlag("tests", false);

    if (result.error) return setError("tests", result.error);
    const tests = await loadTests(ticket.id);
    onDetailChange({ tests, coverageNote: result.coverageNote });
    onClosureChange();
    notify(`${tests.length} test senaryosu üretildi`);
  }

  async function makeChecklist() {
    setFlag("checklist", true);
    const { items, draft } = await buildChecklist(ticket, note);
    setChecklist(items);
    setKbDraft(draft);
    setFlag("checklist", false);
  }

  async function resolve() {
    await supabase
      .from("tickets")
      .update({
        status: "Çözüldü",
        resolution_note: note.trim() || "Çözüm uygulandı.",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", ticket.id);

    if (note.trim()) await appendToKnowledgeBase(ticket.category, note.trim(), kbDraft);

    onTicketsChange();
    setChecklist(null);
    setKbDraft(null);
    setChecked({});
    setNote("");
    notify(`${ticket.ticket_no} kapatıldı`);
  }

  const hasReadableDocument = detail.attachments.some(
    (a) => a.kind === "document" && a.extracted_text,
  );
  const hasApprovedRequirements = detail.requirements.some((r) => r.approved);
  const checklistComplete = checklist?.every((_, i) => checked[i]);

  return (
    <>
      <Header C={C} ticket={ticket} />

      {ticket.recurring_flag && (
        <Note tone="warn" style={{ marginBottom: 24 }}>
          <strong style={{ fontWeight: 500 }}>Tekrarlayan problem sinyali.</strong>{" "}
          {ticket.recurring_note} Bu tekil bir kullanıcı sorunu olmayabilir; Major Incident
          veya Problem kaydı açılması değerlendirilmeli.
        </Note>
      )}

      <Facts C={C} ticket={ticket} />

      {ticket.status !== "Çözüldü" && (detail.triage || detail.triageLoading) && (
        <Row C={C} title="Uzman özeti" description="Muhtemel nedenler ve ilk kontroller">
          {detail.triageLoading ? <Skeleton lines={4} /> : <Triage C={C} triage={detail.triage} />}
        </Row>
      )}

      {ticket.priority_reason && (
        <Row C={C} title="Öncelik gerekçesi" description="Neden bu öncelik verildi">
          <div style={{ fontSize: T.sm, color: C.inkSoft, lineHeight: 1.65, maxWidth: "62ch" }}>
            {ticket.priority_reason}
          </div>
        </Row>
      )}

      <Row C={C} title="Zaman çizelgesi" description="Kaydın geçirdiği aşamalar">
        <Timeline C={C} ticket={ticket} w={w} />
        {detail.estimate && ticket.status !== "Çözüldü" && (
          <Estimate C={C} estimate={detail.estimate} ticket={ticket} />
        )}
      </Row>

      <Row C={C} title="Benzer çağrılar" description="Anlamca yakın geçmiş kayıtlar">
        {detail.similarLoading ? (
          <Skeleton lines={3} />
        ) : detail.similar.length === 0 ? (
          <Empty>Anlamca yeterince yakın geçmiş çağrı bulunamadı.</Empty>
        ) : (
          <div style={{ display: "grid", gap: 9 }}>
            {detail.similar.map((s) => (
              <SimilarCard key={s.id} C={C} ticket={s} />
            ))}
          </div>
        )}
      </Row>

      {detail.attachments.length > 0 && (
        <Row C={C} title="Ekli dosyalar" description="Çağrıya iliştirilen belgeler">
          <AttachmentList items={detail.attachments} compact />
          {detail.attachments
            .filter((a) => a.kind === "image" && a.extracted_text)
            .map((a) => (
              <Note key={a.id} tone="info" style={{ marginTop: 12 }}>
                <div style={{ fontSize: T.xs, color: C.brand, fontWeight: 500, marginBottom: 6 }}>
                  {a.file_name} içeriğinden okunanlar
                </div>
                <div style={{ fontSize: T.sm, color: C.inkSoft, whiteSpace: "pre-wrap" }}>
                  {a.extracted_text}
                </div>
              </Note>
            ))}
        </Row>
      )}

      {hasReadableDocument && (
        <Row C={C} title="Gereksinimler" description="Dokümandan çıkarılan maddeler">
          {detail.requirements.length === 0 ? (
            <Generate
              C={C}
              description="Ekli dokümandan metin çıkarıldı. Yapay zeka bu metni takip edilebilir gereksinim birimlerine ayırabilir; sonuçları düzenleyip onaylayabilirsiniz."
              isOwner={isOwner}
              busy={busy.requirements}
              busyLabel="Doküman analiz ediliyor"
              label="Gereksinimleri çıkar"
              lockedLabel={
                ticket.assignee
                  ? `Bu talebi ${ticket.assignee} analize almış.`
                  : `Gereksinim çıkarımı için önce "${w.take}" adımını tamamlayın.`
              }
              onRun={runExtraction}
            />
          ) : (
            <>
              <Requirements
                items={detail.requirements}
                onChange={(requirements) => onDetailChange({ requirements })}
                summary={detail.reqMeta.summary}
                openQuestions={detail.reqMeta.openQuestions}
                locked={!isOwner}
                lockReason={
                  ticket.assignee
                    ? `Bu talebi ${ticket.assignee} analize almış. Gereksinimleri yalnızca analizi üstlenen kişi düzenleyebilir.`
                    : "Gereksinimleri düzenlemek ve onaylamak için önce talebi analize almanız gerekiyor. Onaylanan gereksinimler test senaryolarının kaynağı olacak."
                }
              />
              {isOwner && (
                <Regenerate
                  C={C}
                  busy={busy.requirements}
                  onRun={runExtraction}
                  label="Yeniden çıkar"
                  busyLabel="Yeniden analiz ediliyor"
                  hint="Onayladığınız ve düzenlediğiniz maddeler korunur."
                />
              )}
            </>
          )}
          {errors.requirements && (
            <div style={{ fontSize: T.xs, color: C.danger, marginTop: 12 }}>{errors.requirements}</div>
          )}
        </Row>
      )}

      {hasApprovedRequirements && (
        <Row C={C} title="Doğrulama testleri" description="Gereksinimlerden üretilen senaryolar">
          {detail.tests.length === 0 ? (
            <Generate
              C={C}
              description="Onayladığınız gereksinimler için doğrulama senaryoları üretilebilir. Her test hangi gereksinimi doğruladığını taşır; kritik işaretli testler tamamlanmadan kayıt kapatılamaz."
              isOwner={isOwner}
              busy={busy.tests}
              busyLabel="Test senaryoları üretiliyor"
              label="Test senaryolarını üret"
              lockedLabel="Test üretimi için kaydı üstlenmeniz gerekiyor."
              onRun={runTestGeneration}
            />
          ) : (
            <>
              <TestCases
                tests={detail.tests}
                requirements={detail.requirements}
                ticket={ticket}
                user={user}
                onChange={(tests) => {
                  onDetailChange({ tests });
                  onClosureChange();
                }}
                coverageNote={detail.coverageNote}
                locked={!isOwner}
                lockReason={
                  ticket.assignee
                    ? `Bu kaydı ${ticket.assignee} üstlenmiş. Testleri yalnızca üstlenen kişi yürütebilir.`
                    : "Test sonuçlarını işaretlemek için kaydı üstlenmeniz gerekiyor."
                }
              />
              {isOwner && (
                <Regenerate
                  C={C}
                  busy={busy.tests}
                  onRun={runTestGeneration}
                  label="Yeniden üret"
                  busyLabel="Yeniden üretiliyor"
                  hint="Elle eklediğiniz ve düzenlediğiniz testler korunur."
                />
              )}
            </>
          )}
          {errors.tests && (
            <div style={{ fontSize: T.xs, color: C.danger, marginTop: 12 }}>{errors.tests}</div>
          )}
        </Row>
      )}

      {ticket.tried_steps?.length > 0 && (
        <Row C={C} title="Denenen adımlar" description="Çalışanın çağrı öncesi yaptıkları">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {ticket.tried_steps.map((s, i) => (
              <li key={i} style={{ fontSize: T.sm, color: C.inkSoft, lineHeight: 1.75 }}>
                {typeof s === "string" ? s : s.text}
              </li>
            ))}
          </ul>
        </Row>
      )}

      {detail.conversation.length > 0 && (
        <Row C={C} title="Konuşma geçmişi" description="Asistanla yapılan görüşme">
          <div
            style={{
              border: `1px solid ${C.line}`,
              borderRadius: 8,
              padding: "14px 16px",
              background: C.surfaceSunken,
              maxHeight: 200,
              overflowY: "auto",
            }}
          >
            {detail.conversation.map((c) => (
              <div key={c.id} style={{ marginBottom: 11, display: "flex", gap: 12 }}>
                <span
                  style={{
                    fontSize: T.xs,
                    fontWeight: 500,
                    color: c.role === "user" ? C.ink : C.brand,
                    flexShrink: 0,
                    width: 62,
                  }}
                >
                  {c.role === "user" ? "Çalışan" : "Asistan"}
                </span>
                <span style={{ fontSize: T.sm, color: C.inkSoft, lineHeight: 1.6 }}>{c.content}</span>
              </div>
            ))}
          </div>
        </Row>
      )}

      {ticket.status === "Açık" && (
        <div style={{ paddingTop: 28 }}>
          <Button onClick={take}>{w.take}</Button>
        </div>
      )}

      {ticket.status === "İşlemde" && (
        <div style={{ paddingTop: 28 }}>
          {!isOwner ? (
            <Note style={{ maxWidth: "64ch" }}>
              Bu kaydı {ticket.assignee} {w.taken}. Kapatma işlemi yalnızca üstlenen kişi
              tarafından yapılabilir.
            </Note>
          ) : (
            <>
              <Block title={w.noteLabel}>
                <TextArea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={w.notePlaceholder}
                />
              </Block>

              {!checklist ? (
                <Button variant="secondary" onClick={makeChecklist} disabled={busy.checklist}>
                  {busy.checklist ? "Kontrol listesi hazırlanıyor" : w.checklistBtn}
                </Button>
              ) : (
                <div
                  style={{
                    border: `1px solid ${C.line}`,
                    borderRadius: 9,
                    padding: "18px 20px",
                    background: C.surfaceAlt,
                  }}
                >
                  <div style={{ fontSize: T.sm, fontWeight: 500, marginBottom: 14 }}>
                    Bu kayda özel son kontroller
                  </div>
                  {checklist.map((item, i) => (
                    <Checkbox
                      key={i}
                      label={item}
                      checked={!!checked[i]}
                      onChange={(e) => setChecked((p) => ({ ...p, [i]: e.target.checked }))}
                      style={{ marginBottom: 12 }}
                    />
                  ))}

                  <KnowledgeDraft C={C} draft={kbDraft} />

                  {!detail.closure.canClose && (
                    <Note tone="danger" style={{ marginTop: 16 }}>
                      <strong style={{ fontWeight: 500 }}>Kapatma engellendi.</strong>{" "}
                      {detail.closure.failed > 0 && `${detail.closure.failed} kritik test başarısız. `}
                      {detail.closure.pending > 0 && `${detail.closure.pending} kritik test henüz yürütülmedi. `}
                      Doğrulama testleri tamamlanmadan bu kayıt kapatılamaz.
                    </Note>
                  )}

                  <div style={{ marginTop: 16 }}>
                    <Button onClick={resolve} disabled={!checklistComplete || !detail.closure.canClose}>
                      {w.resolve}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {ticket.status === "Çözüldü" && (
        <Row C={C} title={w.resolvedLabel} description="Kayda işlenen sonuç" last>
          <Note tone="ok" style={{ maxWidth: "62ch" }}>{ticket.resolution_note}</Note>
        </Row>
      )}
    </>
  );
}

// Teknisyenin çözümü bilgi bankasına eklenip vektörleniyor;
// yapay zeka taslağı varsa Problem > Neden > Çözüm > Kontrol formatında
async function appendToKnowledgeBase(category, note, draft) {
  const entry = draft?.usable
    ? [
        `Problem: ${draft.problem}`,
        `Neden: ${draft.cause}`,
        ...draft.solution.map((s, i) => `Çözüm ${i + 1}: ${s}`),
        `Kontrol: ${draft.verification}`,
      ]
    : [note];

  const { data: existing } = await supabase
    .from("knowledge_base")
    .select("*")
    .eq("category", category)
    .eq("source", "technician")
    .maybeSingle();

  const target = existing
    ? { id: existing.id, steps: [...(existing.steps || []), ...entry] }
    : null;

  if (target) {
    await supabase.from("knowledge_base").update({ steps: target.steps }).eq("id", target.id);
    const vector = await embed([category, ...target.steps].join("\n"), "document");
    if (vector) await supabase.from("knowledge_base").update({ embedding: vector }).eq("id", target.id);
    return;
  }

  const { data: created } = await supabase
    .from("knowledge_base")
    .insert({ category, keywords: [], steps: entry, source: "technician" })
    .select()
    .single();

  if (created) {
    const vector = await embed([category, ...entry].join("\n"), "document");
    if (vector) await supabase.from("knowledge_base").update({ embedding: vector }).eq("id", created.id);
  }
}

/* ---------- Parçalar ---------- */

function Row({ C, title, description, children, last }) {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "178px 1fr",
        gap: 38,
        padding: "28px 0",
        borderTop: `1px solid ${C.line}`,
        borderBottom: last ? `1px solid ${C.line}` : "none",
      }}
    >
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: T.base,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            paddingLeft: 12,
            borderLeft: `3px solid ${C.brand}`,
          }}
        >
          {title}
        </h2>
        {description && (
          <p style={{ margin: "8px 0 0 15px", fontSize: T.xs, color: C.inkFaint, lineHeight: 1.5 }}>
            {description}
          </p>
        )}
      </div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </section>
  );
}

function Header({ C, ticket }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontFamily: F.mono, fontSize: T.xs, color: C.inkFaint }}>
          {ticket.ticket_no}
        </span>
        <Tag text={ticket.ticket_type || "Olay"} tone="info" />
        <Tag text={ticket.priority} tone={priorityTone(ticket.priority)} />
        <Tag text={ticket.status} tone={statusTone(ticket.status)} />
      </div>

      <h2
        style={{
          fontSize: T.lg,
          fontWeight: 500,
          letterSpacing: "-0.028em",
          lineHeight: 1.25,
          margin: "0 0 22px",
          maxWidth: "34ch",
        }}
      >
        {ticket.title}
      </h2>
    </>
  );
}

function Facts({ C, ticket }) {
  const rows = [
    ["Bildiren", ticket.reporter_name],
    ["Kategori", [ticket.category, ticket.sub_category].filter(Boolean).join(" › ")],
    ["Etkilenen sistem", ticket.affected_system],
    ["Destek grubu", ticket.support_group],
    ["Etki", ticket.impact],
    ["Üstlenen", ticket.assignee],
  ].filter(([, v]) => v);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: "14px 24px",
        paddingBottom: 26,
      }}
    >
      {rows.map(([label, value]) => (
        <div key={label}>
          <div style={{ fontSize: T.xs, color: C.inkFaint, marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: T.sm, lineHeight: 1.45 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// Model teşhis koymuyor, ihtimal sıralıyor; olasılık etiketi bunu görünür kılıyor
function Triage({ C, triage }) {
  if (!triage) return null;
  const tone = { Yüksek: "danger", Orta: "warn", Düşük: "neutral" };

  return (
    <div>
      <div style={{ fontSize: T.sm, lineHeight: 1.65, marginBottom: 18, maxWidth: "64ch" }}>
        {triage.summary}
      </div>

      <div style={{ fontSize: T.xs, color: C.inkFaint, marginBottom: 10 }}>Muhtemel nedenler</div>
      <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
        {triage.probableCauses.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
            <Tag text={c.likelihood} tone={tone[c.likelihood]} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: T.sm, lineHeight: 1.55 }}>{c.cause}</span>
              {c.basis && (
                <span style={{ display: "block", fontSize: T.xs, color: C.inkSoft, marginTop: 3, lineHeight: 1.55 }}>
                  {c.basis}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: T.xs, color: C.inkFaint, marginBottom: 8 }}>Önerilen ilk kontroller</div>
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        {triage.nextActions.map((a, i) => (
          <li key={i} style={{ fontSize: T.sm, color: C.inkSoft, lineHeight: 1.75 }}>{a}</li>
        ))}
      </ol>

      {triage.escalationHint && (
        <div style={{ fontSize: T.xs, color: C.warn, marginTop: 14, lineHeight: 1.6 }}>
          {triage.escalationHint}
        </div>
      )}
    </div>
  );
}

function Timeline({ C, ticket, w }) {
  const steps = [
    { label: w.opened, at: ticket.created_at, done: true },
    {
      label: ticket.assignee ? `${ticket.assignee} ${w.taken}` : w.timelineTake,
      at: ticket.taken_at,
      done: !!ticket.taken_at,
    },
    { label: w.timelineDone, at: ticket.resolved_at, done: !!ticket.resolved_at },
  ];

  const total = duration(ticket.created_at, ticket.resolved_at);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        {steps.map((s, i) => (
          <div key={i} style={{ flex: i < steps.length - 1 ? 1 : "0 0 auto", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: s.done ? C.brand : "transparent",
                  border: `1.5px solid ${s.done ? C.brand : C.lineStrong}`,
                  flexShrink: 0,
                }}
              />
              {i < steps.length - 1 && (
                <span style={{ flex: 1, height: 1.5, background: steps[i + 1].done ? C.brand : C.line }} />
              )}
            </div>
            <div style={{ paddingRight: 14, marginTop: 10 }}>
              <div style={{ fontSize: T.xs, color: s.done ? C.ink : C.inkFaint, lineHeight: 1.4 }}>
                {s.label}
              </div>
              <div style={{ fontSize: T.xs, color: C.inkFaint, marginTop: 3 }}>
                {s.at ? clockTime(s.at) : "bekliyor"}
              </div>
            </div>
          </div>
        ))}
      </div>
      {total && (
        <div style={{ fontSize: T.xs, color: C.inkFaint, marginTop: 14 }}>
          Toplam çözüm süresi: {total}
        </div>
      )}
    </div>
  );
}

// Tahmin geçmiş çağrıların gerçek sürelerinden hesaplanıyor;
// örnek sayısı da gösteriliyor çünkü 3 kayıt ile 40 kayıt aynı güveni taşımıyor
function Estimate({ C, estimate, ticket }) {
  const openMinutes = Math.round((Date.now() - new Date(ticket.created_at)) / 60000);
  const overdue = openMinutes > estimate.medianMinutes * 1.5;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 22,
        padding: "16px 18px",
        marginTop: 20,
        background: overdue ? C.warnSoft : C.surfaceSunken,
        border: `1px solid ${overdue ? `${C.warn}44` : C.line}`,
        borderRadius: 8,
        flexWrap: "wrap",
      }}
    >
      <div>
        <div style={{ fontSize: T.md, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1 }}>
          {formatMinutes(estimate.medianMinutes)}
        </div>
        <div style={{ fontSize: T.xs, color: C.inkFaint, marginTop: 5 }}>ortanca süre</div>
      </div>

      <div style={{ fontSize: T.xs, color: C.inkSoft, lineHeight: 1.65, flex: 1, minWidth: 220 }}>
        {estimate.sampleSize} çözülmüş {estimate.basis} baz alındı. En hızlısı{" "}
        {formatMinutes(estimate.fastestMinutes)}, en yavaşı {formatMinutes(estimate.slowestMinutes)}.
        {estimate.sampleSize < 5 && " Örnek sayısı az, tahmin kabaca."}
      </div>

      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: T.sm, fontWeight: 500, color: overdue ? C.warn : C.inkSoft }}>
          {formatMinutes(openMinutes)}
        </div>
        <div style={{ fontSize: T.xs, color: C.inkFaint, marginTop: 3 }}>
          {overdue ? "beklenenin üzerinde" : "açık kalma süresi"}
        </div>
      </div>
    </div>
  );
}

// Benzerlik yüzdesi kosinüs skorundan gelir, modelin tahmini değil
function SimilarCard({ C, ticket: s }) {
  return (
    <div
      style={{
        border: `1px solid ${s.useful ? `${C.ok}55` : C.line}`,
        background: s.useful ? C.okSoft : C.surfaceAlt,
        borderRadius: 9,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7, flexWrap: "wrap" }}>
        <span style={{ fontFamily: F.mono, fontSize: T.xs, color: C.inkFaint }}>{s.ticket_no}</span>
        <Tag text={s.status} tone={statusTone(s.status)} />
        <span style={{ fontSize: T.xs, color: C.brand, fontWeight: 500 }}>
          %{Math.round(s.similarity * 100)} eşleşme
        </span>
        {s.useful && <Tag text="Çözümü uygulanabilir" tone="ok" />}
      </div>

      <div style={{ fontSize: T.sm, lineHeight: 1.55, marginBottom: 7 }}>{s.title}</div>

      {s.reason && (
        <div style={{ fontSize: T.xs, color: C.inkSoft, lineHeight: 1.65, marginBottom: 7 }}>
          {s.reason}
        </div>
      )}

      {s.resolution_note && (
        <div
          style={{
            fontSize: T.xs,
            color: C.inkSoft,
            lineHeight: 1.65,
            paddingTop: 9,
            borderTop: `1px solid ${C.line}`,
          }}
        >
          Uygulanan çözüm: {s.resolution_note}
        </div>
      )}
    </div>
  );
}

// Serbest metin çözüm notu, aranabilir ve tekrar uygulanabilir bir kayda dönüşüyor
function KnowledgeDraft({ C, draft }) {
  if (!draft) return null;

  if (!draft.usable) {
    return (
      <Note style={{ marginTop: 16, fontSize: T.xs }}>
        Bu çözüm tek seferlik görünüyor; bilgi bankası taslağı oluşturulmadı. Çözüm notu
        yine de kayda ekleniyor.
      </Note>
    );
  }

  const rows = [
    ["Problem", draft.problem],
    ["Neden", draft.cause],
    ["Çözüm", draft.solution],
    ["Kontrol", draft.verification],
  ];

  return (
    <div
      style={{
        marginTop: 16,
        border: `1px solid ${C.ok}33`,
        background: C.okSoft,
        borderRadius: 8,
        padding: "15px 17px",
      }}
    >
      <div style={{ fontSize: T.xs, fontWeight: 500, color: C.ok, marginBottom: 4 }}>
        Bilgi bankası taslağı
      </div>
      <div style={{ fontSize: T.xs, color: C.inkSoft, marginBottom: 14, lineHeight: 1.55 }}>
        Kapatma sonrası bu yapıda kaydedilecek ve benzer sorunlarda önerilecek.
      </div>

      <div style={{ fontSize: T.sm, fontWeight: 500, marginBottom: 12 }}>{draft.title}</div>

      {rows.map(([label, value]) => (
        <div key={label} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: T.xs, color: C.inkFaint, marginBottom: 3 }}>{label}</div>
          {Array.isArray(value) ? (
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {value.map((v, i) => (
                <li key={i} style={{ fontSize: T.xs, color: C.inkSoft, lineHeight: 1.7 }}>{v}</li>
              ))}
            </ol>
          ) : (
            <div style={{ fontSize: T.xs, color: C.inkSoft, lineHeight: 1.7 }}>{value}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function Generate({ C, description, isOwner, busy, busyLabel, label, lockedLabel, onRun }) {
  return (
    <div>
      <div style={{ fontSize: T.sm, color: C.inkSoft, lineHeight: 1.65, marginBottom: 16, maxWidth: "64ch" }}>
        {description}
      </div>
      {isOwner ? (
        <Button variant="secondary" onClick={onRun} disabled={busy}>
          {busy ? busyLabel : label}
        </Button>
      ) : (
        <Note style={{ maxWidth: "64ch" }}>{lockedLabel}</Note>
      )}
    </div>
  );
}

function Regenerate({ C, busy, onRun, label, busyLabel, hint }) {
  return (
    <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <Button variant="ghost" onClick={onRun} disabled={busy}>
        {busy ? busyLabel : label}
      </Button>
      <span style={{ fontSize: T.xs, color: C.inkFaint }}>{hint}</span>
    </div>
  );
}
