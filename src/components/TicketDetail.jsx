import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/ThemeContext";
import { F } from "../lib/theme";
import {
  Tag, Button, Section, Note, Empty, TextArea, Checkbox,
  priorityTone, statusTone, clockTime, duration,
} from "./UI";
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

  const setFlag = (key, value) => setBusy((b) => ({ ...b, [key]: value }));
  const setError = (key, value) => setErrors((e) => ({ ...e, [key]: value }));

  async function take() {
    await supabase
      .from("tickets")
      .update({ status: "İşlemde", assignee: user.name, taken_at: new Date().toISOString() })
      .eq("id", ticket.id);
    onTicketsChange();
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
  }

  async function runTestGeneration() {
    setFlag("tests", true);
    setError("tests", null);
    const result = await generateTests({ ticket, requirements: detail.requirements });
    setFlag("tests", false);

    if (result.error) return setError("tests", result.error);
    onDetailChange({ tests: await loadTests(ticket.id), coverageNote: result.coverageNote });
    onClosureChange();
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
        <Note tone="warn" style={{ marginBottom: 22 }}>
          <strong>Tekrarlayan problem sinyali.</strong> {ticket.recurring_note} Bu tekil
          bir kullanıcı sorunu olmayabilir; Major Incident veya Problem kaydı açılması
          değerlendirilmeli.
        </Note>
      )}

      <Facts C={C} ticket={ticket} />

      {ticket.status !== "Çözüldü" && (detail.triage || detail.triageLoading) && (
        <TriageBlock C={C} triage={detail.triage} loading={detail.triageLoading} />
      )}

      {ticket.priority_reason && (
        <Section title="Öncelik gerekçesi">
          <div style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.6, maxWidth: "62ch" }}>
            {ticket.priority_reason}
          </div>
        </Section>
      )}

      <Timeline C={C} ticket={ticket} w={w} />

      {detail.estimate && ticket.status !== "Çözüldü" && (
        <ResolutionEstimate C={C} estimate={detail.estimate} ticket={ticket} />
      )}

      <Section title="Benzer geçmiş çağrılar">
        {detail.similarLoading ? (
          <Empty>Semantik arama yapılıyor…</Empty>
        ) : detail.similar.length === 0 ? (
          <Empty>Anlamca yeterince yakın geçmiş çağrı bulunamadı.</Empty>
        ) : (
          <div style={{ display: "grid", gap: 9 }}>
            {detail.similar.map((s) => (
              <SimilarCard key={s.id} C={C} ticket={s} />
            ))}
          </div>
        )}
      </Section>

      {detail.attachments.length > 0 && (
        <Section title="Ekli dosyalar">
          <AttachmentList items={detail.attachments} compact />
          {detail.attachments
            .filter((a) => a.kind === "image" && a.extracted_text)
            .map((a) => (
              <Note key={a.id} tone="info" style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11.5, color: C.info, fontWeight: 600, marginBottom: 5 }}>
                  {a.file_name} içeriğinden okunanlar
                </div>
                <div style={{ fontSize: 13, color: C.inkSoft, whiteSpace: "pre-wrap" }}>
                  {a.extracted_text}
                </div>
              </Note>
            ))}
        </Section>
      )}

      {hasReadableDocument && (
        <Section title="Dokümandan çıkarılan gereksinimler">
          {detail.requirements.length === 0 ? (
            <GenerateBlock
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
                    : "Gereksinimleri düzenlemek ve onaylamak için önce talebi analize almanız gerekiyor. Onaylanan gereksinimler test senaryolarının kaynağı olacak, bu yüzden sorumluluk analize alan kişiye ait."
                }
              />
              {isOwner && (
                <RegenerateRow
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
            <div style={{ fontSize: 12.5, color: C.danger, marginTop: 10 }}>{errors.requirements}</div>
          )}
        </Section>
      )}

      {hasApprovedRequirements && (
        <Section title="Doğrulama testleri">
          {detail.tests.length === 0 ? (
            <GenerateBlock
              C={C}
              description="Onayladığınız gereksinimler için doğrulama senaryoları üretilebilir. Üretilen her test, hangi gereksinimi doğruladığını taşır; kritik işaretli testler tamamlanmadan kayıt kapatılamaz."
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
                <RegenerateRow
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
            <div style={{ fontSize: 12.5, color: C.danger, marginTop: 10 }}>{errors.tests}</div>
          )}
        </Section>
      )}

      {ticket.tried_steps?.length > 0 && (
        <Section title="Çalışan çağrıdan önce bunları denedi">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {ticket.tried_steps.map((s, i) => (
              <li key={i} style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.7 }}>
                {typeof s === "string" ? s : s.text}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {detail.conversation.length > 0 && (
        <Section title="Asistanla konuşma geçmişi">
          <div
            style={{
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              padding: "13px 15px",
              background: C.surfaceSunken,
              maxHeight: 190,
              overflowY: "auto",
            }}
          >
            {detail.conversation.map((c) => (
              <div key={c.id} style={{ marginBottom: 10, display: "flex", gap: 10 }}>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: c.role === "user" ? C.ink : C.brand,
                    flexShrink: 0,
                    width: 62,
                  }}
                >
                  {c.role === "user" ? "Çalışan" : "Asistan"}
                </span>
                <span style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}>{c.content}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {ticket.status === "Açık" && <Button onClick={take}>{w.take}</Button>}

      {ticket.status === "İşlemde" && (
        <>
          {!isOwner && (
            <Note style={{ marginBottom: 20, maxWidth: "64ch" }}>
              Bu kaydı {ticket.assignee} {w.taken}. Kapatma işlemi yalnızca üstlenen
              kişi tarafından yapılabilir.
            </Note>
          )}

          {isOwner && (
            <>
              <Section title={w.noteLabel}>
                <TextArea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={w.notePlaceholder}
                  style={{ fontSize: 14, padding: "11px 13px", borderRadius: 10 }}
                />
              </Section>

              {!checklist ? (
                <Button variant="dark" onClick={makeChecklist} disabled={busy.checklist}>
                  {busy.checklist ? "Kontrol listesi hazırlanıyor" : w.checklistBtn}
                </Button>
              ) : (
                <div
                  style={{
                    border: `1px solid ${C.line}`,
                    borderRadius: 12,
                    padding: "16px 18px",
                    background: C.surfaceAlt,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 13 }}>
                    Bu kayda özel son kontroller
                  </div>
                  {checklist.map((item, i) => (
                    <Checkbox
                      key={i}
                      label={item}
                      checked={!!checked[i]}
                      onChange={(e) => setChecked((p) => ({ ...p, [i]: e.target.checked }))}
                      style={{ marginBottom: 11 }}
                    />
                  ))}

                  <KnowledgeDraft C={C} draft={kbDraft} />

                  {!detail.closure.canClose && (
                    <Note tone="danger" style={{ marginTop: 14 }}>
                      <strong>Kapatma engellendi.</strong>{" "}
                      {detail.closure.failed > 0 && `${detail.closure.failed} kritik test başarısız. `}
                      {detail.closure.pending > 0 && `${detail.closure.pending} kritik test henüz yürütülmedi. `}
                      Yukarıdaki doğrulama testleri tamamlanmadan bu kayıt kapatılamaz.
                    </Note>
                  )}

                  <Button
                    onClick={resolve}
                    disabled={!checklistComplete || !detail.closure.canClose}
                    style={{ marginTop: detail.closure.canClose ? 6 : 12 }}
                  >
                    {w.resolve}
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {ticket.status === "Çözüldü" && (
        <Section title={w.resolvedLabel}>
          <Note tone="brand" style={{ fontSize: 13.5, color: C.inkSoft, maxWidth: "62ch" }}>
            {ticket.resolution_note}
          </Note>
        </Section>
      )}
    </>
  );
}

// Teknisyenin çözümü bilgi bankasına eklenir ve vektörlenir;
// sistem kullanıldıkça kendi kurumunun bilgisini biriktiriyor.
// Yapay zeka taslağı varsa Problem > Neden > Çözüm > Kontrol
// formatında, yoksa ham not olarak.
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

  if (existing) {
    const steps = [...(existing.steps || []), ...entry];
    await supabase.from("knowledge_base").update({ steps }).eq("id", existing.id);
    const vector = await embed([category, ...steps].join("\n"), "document");
    if (vector) await supabase.from("knowledge_base").update({ embedding: vector }).eq("id", existing.id);
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

function Header({ C, ticket }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: F.mono, fontSize: 12.5, color: C.inkFaint }}>{ticket.ticket_no}</span>
        <Tag text={ticket.ticket_type || "Olay"} tone="info" />
        <Tag text={ticket.priority} tone={priorityTone(ticket.priority)} />
        <Tag text={ticket.status} tone={statusTone(ticket.status)} />
      </div>

      <h2
        style={{
          fontFamily: F.display,
          fontSize: 27,
          fontWeight: 700,
          letterSpacing: "-0.032em",
          lineHeight: 1.2,
          margin: "0 0 14px",
          maxWidth: "32ch",
          color: C.ink,
        }}
      >
        {ticket.title}
      </h2>
    </>
  );
}

// Model teşhis koymuyor, ihtimal sıralıyor; olasılık etiketi
// bunu görünür kılıyor
function TriageBlock({ C, triage, loading }) {
  if (loading) {
    return (
      <Section title="Uzman özeti">
        <Empty>Değerlendirme hazırlanıyor…</Empty>
      </Section>
    );
  }
  if (!triage) return null;

  const tone = { Yüksek: "danger", Orta: "warn", Düşük: "neutral" };

  return (
    <Section title="Uzman özeti">
      <div
        style={{
          border: `1px solid ${C.info}33`,
          background: C.infoSoft,
          borderRadius: 12,
          padding: "16px 18px",
        }}
      >
        <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.6, marginBottom: 16, maxWidth: "64ch" }}>
          {triage.summary}
        </div>

        <div style={{ fontSize: 12, color: C.inkFaint, marginBottom: 9 }}>Muhtemel nedenler</div>
        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          {triage.probableCauses.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Tag text={c.likelihood} tone={tone[c.likelihood]} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5 }}>{c.cause}</div>
                {c.basis && (
                  <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 2, lineHeight: 1.5 }}>
                    {c.basis}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: C.inkFaint, marginBottom: 7 }}>Önerilen ilk kontroller</div>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {triage.nextActions.map((a, i) => (
            <li key={i} style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.7 }}>{a}</li>
          ))}
        </ol>

        {triage.escalationHint && (
          <div style={{ fontSize: 12.5, color: C.warn, marginTop: 12, lineHeight: 1.55 }}>
            {triage.escalationHint}
          </div>
        )}
      </div>
    </Section>
  );
}

// Serbest metin çözüm notu, aranabilir ve tekrar uygulanabilir
// bir kayda dönüştürülüyor
function KnowledgeDraft({ C, draft }) {
  if (!draft) return null;

  if (!draft.usable) {
    return (
      <Note style={{ marginTop: 14, fontSize: 12.5 }}>
        Bu çözüm tek seferlik görünüyor; bilgi bankası taslağı oluşturulmadı.
        Çözüm notu yine de kayda ekleniyor.
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
        marginTop: 14,
        border: `1px solid ${C.brand}33`,
        background: C.brandTint,
        borderRadius: 11,
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.brand, marginBottom: 4 }}>
        Bilgi bankası taslağı
      </div>
      <div style={{ fontSize: 11.5, color: C.inkSoft, marginBottom: 12, lineHeight: 1.5 }}>
        Kapatma sonrası bu yapıda kaydedilecek ve benzer sorunlarda önerilecek.
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 11 }}>
        {draft.title}
      </div>

      {rows.map(([label, value]) => (
        <div key={label} style={{ marginBottom: 9 }}>
          <div style={{ fontSize: 11.5, color: C.inkFaint, marginBottom: 2 }}>{label}</div>
          {Array.isArray(value) ? (
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {value.map((v, i) => (
                <li key={i} style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.6 }}>{v}</li>
              ))}
            </ol>
          ) : (
            <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.6 }}>{value}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// Tahmin geçmiş çağrıların gerçek sürelerinden hesaplanıyor.
// Örnek sayısı da gösteriliyor: 3 çağrıya dayanan bir ortalama
// ile 40 çağrıya dayanan aynı güveni taşımıyor.
function ResolutionEstimate({ C, estimate, ticket }) {
  const openMinutes = Math.round((Date.now() - new Date(ticket.created_at)) / 60000);
  const overdue = openMinutes > estimate.medianMinutes * 1.5;

  return (
    <Section title="Tahmini çözüm süresi">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 22,
          padding: "14px 18px",
          background: overdue ? C.warnSoft : C.surfaceSunken,
          border: `1px solid ${overdue ? `${C.warn}55` : C.line}`,
          borderRadius: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: F.display,
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: C.ink,
              lineHeight: 1,
            }}
          >
            {formatMinutes(estimate.medianMinutes)}
          </div>
          <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 5 }}>ortanca süre</div>
        </div>

        <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.6, flex: 1, minWidth: 220 }}>
          {estimate.sampleSize} çözülmüş {estimate.basis} baz alındı. En hızlısı{" "}
          {formatMinutes(estimate.fastestMinutes)}, en yavaşı{" "}
          {formatMinutes(estimate.slowestMinutes)}.
          {estimate.sampleSize < 5 && " Örnek sayısı az, tahmin kabaca."}
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: overdue ? C.warn : C.inkSoft }}>
            {formatMinutes(openMinutes)}
          </div>
          <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 3 }}>
            {overdue ? "beklenenin üzerinde" : "açık kalma süresi"}
          </div>
        </div>
      </div>
    </Section>
  );
}

function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours} sa ${rest} dk` : `${hours} sa`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} gün ${restHours} sa` : `${days} gün`;
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
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: "12px 22px",
        padding: "16px 18px",
        background: C.surfaceSunken,
        borderRadius: 12,
        marginBottom: 24,
      }}
    >
      {rows.map(([label, value]) => (
        <div key={label}>
          <div style={{ fontSize: 11.5, color: C.inkFaint, marginBottom: 3 }}>{label}</div>
          <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.4 }}>{value}</div>
        </div>
      ))}
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
    <div style={{ marginBottom: 26 }}>
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
            <div style={{ paddingRight: 14, marginTop: 9 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: s.done ? C.ink : C.inkFaint, lineHeight: 1.35 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 2 }}>
                {s.at ? clockTime(s.at) : "bekliyor"}
              </div>
            </div>
          </div>
        ))}
      </div>
      {total && (
        <div style={{ fontSize: 12.5, color: C.inkFaint, marginTop: 12 }}>
          Toplam çözüm süresi: {total}
        </div>
      )}
    </div>
  );
}

// Benzerlik yüzdesi kosinüs skorundan gelir, modelin tahmini değil;
// gerekçe ise modelden
function SimilarCard({ C, ticket: s }) {
  return (
    <div
      style={{
        border: `1px solid ${s.useful ? `${C.brand}55` : C.line}`,
        background: s.useful ? C.brandTint : C.surfaceAlt,
        borderRadius: 11,
        padding: "13px 15px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.inkFaint }}>{s.ticket_no}</span>
        <Tag text={s.status} tone={statusTone(s.status)} />
        <span style={{ fontSize: 12, color: C.brand, fontWeight: 600 }}>
          %{Math.round(s.similarity * 100)} eşleşme
        </span>
        {s.useful && <Tag text="Çözümü uygulanabilir" tone="brand" />}
      </div>

      <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5, marginBottom: 6 }}>{s.title}</div>

      {s.reason && (
        <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.55, marginBottom: 6 }}>
          {s.reason}
        </div>
      )}

      {s.resolution_note && (
        <div
          style={{
            fontSize: 12.5,
            color: C.inkSoft,
            lineHeight: 1.55,
            paddingTop: 7,
            borderTop: `1px dashed ${C.line}`,
          }}
        >
          Uygulanan çözüm: {s.resolution_note}
        </div>
      )}
    </div>
  );
}

function GenerateBlock({ C, description, isOwner, busy, busyLabel, label, lockedLabel, onRun }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.6, marginBottom: 12, maxWidth: "64ch" }}>
        {description}
      </div>
      {isOwner ? (
        <Button variant="dark" onClick={onRun} disabled={busy}>
          {busy ? busyLabel : label}
        </Button>
      ) : (
        <Note style={{ maxWidth: "64ch" }}>{lockedLabel}</Note>
      )}
    </div>
  );
}

function RegenerateRow({ C, busy, onRun, label, busyLabel, hint }) {
  return (
    <div style={{ marginTop: 14 }}>
      <Button variant="ghost" onClick={onRun} disabled={busy} style={{ padding: "7px 14px", fontSize: 13 }}>
        {busy ? busyLabel : label}
      </Button>
      <span style={{ fontSize: 12, color: C.inkFaint, marginLeft: 12 }}>{hint}</span>
    </div>
  );
}
