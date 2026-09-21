import React, { useState, useRef } from "react";
import { useTheme } from "../lib/ThemeContext";
import { F, T } from "../lib/theme";
import {
  Tag, Button, IconButton, Label, TextInput, TextArea, Select,
  Note, Progress, testTypeTone, resultTone, dateTime,
} from "./UI";
import { useToast } from "./Toast";
import {
  recordExecution, loadTestHistory, updateTest,
  toggleCritical, deleteTest, addManualTest, nextTestCode,
} from "../lib/tests";
import { uploadAttachment, humanSize } from "../lib/documents";

const TYPES = ["Pozitif", "Negatif", "Sınır Değer", "Yetki", "Regresyon"];
const RESULTS = ["Başarılı", "Başarısız", "Uygulanamaz"];

export default function TestCases({
  tests, requirements, ticket, user, onChange, coverageNote, locked, lockReason,
}) {
  const { C } = useTheme();
  const notify = useToast();
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(false);

  const reqById = Object.fromEntries((requirements || []).map((r) => [r.id, r]));

  const executed = tests.filter((t) => t.latest).length;
  const critical = tests.filter((t) => t.is_critical);
  const criticalDone = critical.filter((t) => t.latest && t.latest.result !== "Başarısız").length;

  function replace(updated) {
    onChange(tests.map((t) => (t.id === updated.id ? { ...updated, latest: t.latest } : t)));
  }

  async function remove(t) {
    await deleteTest(t.id);
    onChange(tests.filter((x) => x.id !== t.id));
    notify(`${t.code} silindi`, "warn");
  }

  async function handleAdd(values) {
    const { test } = await addManualTest({
      ticketId: ticket.id,
      requirementId: values.requirement_id,
      values,
      order: tests.length,
    });
    if (test) {
      onChange([...tests, { ...test, latest: null }]);
      setAdding(false);
      notify(`${test.code} eklendi`);
    }
  }

  return (
    <div>
      {coverageNote && <Note style={{ marginBottom: 16, maxWidth: "68ch" }}>{coverageNote}</Note>}
      {locked && <Note style={{ marginBottom: 16 }}>{lockReason}</Note>}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          marginBottom: 16,
          fontSize: T.xs,
          color: C.inkFaint,
          flexWrap: "wrap",
        }}
      >
        <span>{executed} / {tests.length} yürütüldü</span>
        {critical.length > 0 && (
          <span style={{ color: criticalDone === critical.length ? C.ok : C.warn }}>
            {criticalDone} / {critical.length} kritik tamamlandı
          </span>
        )}
        <Progress value={executed} total={tests.length} />
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {tests.map((t) =>
          editingId === t.id ? (
            <TestForm
              key={t.id}
              C={C}
              initial={t}
              requirements={requirements}
              onSave={async (patch) => {
                replace(await updateTest(t.id, patch));
                setEditingId(null);
                notify(`${t.code} güncellendi`);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <TestCard
              key={t.id}
              C={C}
              test={t}
              requirement={reqById[t.requirement_id]}
              user={user}
              ticket={ticket}
              locked={locked}
              onEdit={() => setEditingId(t.id)}
              onRemove={() => remove(t)}
              onToggleCritical={async () => {
                const updated = await toggleCritical(t.id, !t.is_critical);
                replace(updated);
                notify(updated.is_critical ? `${t.code} kritik işaretlendi` : `${t.code} kritikten çıkarıldı`);
              }}
              onExecuted={(execution) => {
                onChange(tests.map((x) => (x.id === t.id ? { ...x, latest: execution } : x)));
                notify(`${t.code} ${execution.result.toLocaleLowerCase("tr")} işaretlendi`,
                  execution.result === "Başarısız" ? "danger" : "ok");
              }}
            />
          ),
        )}
      </div>

      {!locked && (
        <div style={{ marginTop: 16 }}>
          {adding ? (
            <TestForm
              C={C}
              initial={{ code: nextTestCode(tests), test_type: "Pozitif", steps: [] }}
              requirements={requirements}
              onSave={handleAdd}
              onCancel={() => setAdding(false)}
              isNew
            />
          ) : (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              Elle test ekle
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function TestCard({ C, test: t, requirement, user, ticket, locked, onEdit, onRemove, onToggleCritical, onExecuted }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);
  const fileRef = useRef(null);

  const latest = t.latest;
  const status = latest?.result;

  async function mark(result) {
    // "Başarısız" tek başına bilgi değil; neyin bozuk olduğu gerekiyor
    if (result === "Başarısız" && !note.trim()) {
      setOpen(true);
      return;
    }

    setBusy(true);
    let attachmentId = null;

    if (evidence) {
      try {
        const saved = await uploadAttachment(evidence, { ticketId: ticket.id, uploadedBy: user.name });
        attachmentId = saved.id;
      } catch (err) {
        console.warn("Kanıt yüklenemedi:", err.message);
      }
    }

    const { execution } = await recordExecution({
      testCaseId: t.id,
      ticketId: ticket.id,
      result,
      note,
      attachmentId,
      executedBy: user.name,
    });

    setBusy(false);
    if (execution) {
      onExecuted({ ...execution, test_case_id: t.id });
      setNote("");
      setEvidence(null);
      setOpen(false);
      setHistory(null);
    }
  }

  const border =
    status === "Başarısız" ? `${C.danger}55`
    : status === "Başarılı" ? `${C.ok}55`
    : t.is_critical ? `${C.warn}44`
    : C.line;

  return (
    <div
      style={{
        border: `1px solid ${border}`,
        background: status === "Başarılı" ? C.okSoft : C.surface,
        borderRadius: 9,
        padding: "15px 17px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9, flexWrap: "wrap" }}>
        <span style={{ fontFamily: F.mono, fontSize: T.xs, fontWeight: 500, color: C.brand }}>
          {t.code}
        </span>
        <Tag text={t.test_type} tone={testTypeTone(t.test_type)} />
        {t.is_critical && <Tag text="Kritik" tone="danger" />}
        {status && <Tag text={status} tone={resultTone(status)} />}
        {t.created_by === "human" && (
          <span style={{ fontSize: T.xs, color: C.brand }}>elle eklendi</span>
        )}

        {!locked && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            <IconButton
              name="star"
              onClick={onToggleCritical}
              title={t.is_critical ? "Kritikten çıkar" : "Kritik yap"}
            />
            <IconButton name="edit" onClick={onEdit} title="Düzenle" />
            <IconButton name="trash" onClick={onRemove} title="Sil" danger />
          </span>
        )}
      </div>

      <div style={{ fontSize: T.base, fontWeight: 500, lineHeight: 1.45 }}>{t.title}</div>

      {requirement && (
        <div style={{ fontSize: T.xs, color: C.inkFaint, marginTop: 7 }}>
          Doğruladığı gereksinim:{" "}
          <span style={{ fontFamily: F.mono }}>{requirement.code}</span> · {requirement.title}
        </div>
      )}

      {t.is_critical && t.critical_reason && (
        <div style={{ fontSize: T.xs, color: C.warn, marginTop: 7, lineHeight: 1.6 }}>
          Kritik sayılma sebebi: {t.critical_reason}
        </div>
      )}

      <LinkButton C={C} onClick={() => setOpen((v) => !v)} style={{ marginTop: 12 }}>
        {open ? "Detayı gizle" : "Adımları ve beklenen sonucu gör"}
      </LinkButton>

      {open && (
        <div style={{ marginTop: 14 }}>
          {t.preconditions && <Field C={C} label="Ön koşul">{t.preconditions}</Field>}

          {t.steps?.length > 0 && (
            <div style={{ marginBottom: 13 }}>
              <div style={{ fontSize: T.xs, color: C.inkFaint, marginBottom: 6 }}>Adımlar</div>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {t.steps.map((s, i) => (
                  <li key={i} style={{ fontSize: T.sm, color: C.inkSoft, lineHeight: 1.75 }}>{s}</li>
                ))}
              </ol>
            </div>
          )}

          <Field C={C} label="Beklenen sonuç" strong>{t.expected_result}</Field>

          {!locked && (
            <>
              <TextArea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Açıklama veya gözlem. Başarısız işaretlerken zorunlu."
                rows={2}
                style={{ marginBottom: 11 }}
              />

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.docx"
                  onChange={(e) => setEvidence(e.target.files?.[0] || null)}
                  style={{ display: "none" }}
                />
                <Button variant="outline" onClick={() => fileRef.current?.click()}>
                  Kanıt ekle
                </Button>
                {evidence && (
                  <span style={{ fontSize: T.xs, color: C.inkSoft }}>
                    {evidence.name} · {humanSize(evidence.size)}
                    <LinkButton C={C} onClick={() => setEvidence(null)} style={{ marginLeft: 8 }}>
                      kaldır
                    </LinkButton>
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {RESULTS.map((r) => (
                  <Button
                    key={r}
                    variant={r === "Başarılı" ? "primary" : r === "Başarısız" ? "danger" : "outline"}
                    onClick={() => mark(r)}
                    disabled={busy}
                  >
                    {r}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {latest && (
        <div
          style={{
            marginTop: 13,
            paddingTop: 12,
            borderTop: `1px solid ${C.line}`,
            fontSize: T.xs,
            color: C.inkSoft,
            lineHeight: 1.65,
          }}
        >
          <span style={{ color: status === "Başarısız" ? C.danger : C.inkSoft }}>
            {latest.executed_by} tarafından {status} işaretlendi
          </span>
          {latest.note && <div style={{ marginTop: 5 }}>{latest.note}</div>}
          <LinkButton
            C={C}
            onClick={async () => setHistory(history ? null : await loadTestHistory(t.id))}
            style={{ marginTop: 8, display: "block" }}
          >
            {history ? "Geçmişi gizle" : "Yürütme geçmişi"}
          </LinkButton>
        </div>
      )}

      {history && (
        <div style={{ marginTop: 10, padding: "12px 14px", background: C.surfaceSunken, borderRadius: 8 }}>
          {history.map((h) => (
            <div key={h.id} style={{ fontSize: T.xs, color: C.inkSoft, marginBottom: 9, lineHeight: 1.6 }}>
              <span style={{ color: h.result === "Başarısız" ? C.danger : C.ok, fontWeight: 500 }}>
                {h.result}
              </span>
              {" · "}{h.executed_by}{" · "}{dateTime(h.executed_at)}
              {h.note && <div style={{ marginTop: 3 }}>{h.note}</div>}
              {h.attachments?.public_url && (
                <a
                  href={h.attachments.public_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: C.brand }}
                >
                  {h.attachments.file_name}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TestForm({ C, initial, requirements, onSave, onCancel, isNew }) {
  const [form, setForm] = useState({
    code: initial.code || "",
    title: initial.title || "",
    test_type: initial.test_type || "Pozitif",
    requirement_id: initial.requirement_id || requirements?.[0]?.id || "",
    preconditions: initial.preconditions || "",
    stepsText: (initial.steps || []).join("\n"),
    expected_result: initial.expected_result || "",
    is_critical: initial.is_critical || false,
  });

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  function submit() {
    const { stepsText, requirement_id, ...rest } = form;
    const payload = {
      ...rest,
      steps: stepsText.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    if (isNew) payload.requirement_id = requirement_id;
    onSave(payload);
  }

  return (
    <div style={{ border: `1px solid ${C.brand}`, background: C.surface, borderRadius: 9, padding: "17px 18px" }}>
      <div style={{ fontFamily: F.mono, fontSize: T.xs, color: C.brand, marginBottom: 14 }}>
        {isNew ? "Yeni test" : `${initial.code} düzenleniyor`}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 13, flexWrap: "wrap" }}>
        <div style={{ width: 120 }}>
          <Label>Kod</Label>
          <TextInput value={form.code} onChange={set("code")} />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <Label>Tip</Label>
          <Select value={form.test_type} onChange={set("test_type")} options={TYPES} />
        </div>
      </div>

      {isNew && requirements?.length > 0 && (
        <div style={{ marginBottom: 13 }}>
          <Label>Doğruladığı gereksinim</Label>
          <Select
            value={form.requirement_id}
            onChange={set("requirement_id")}
            options={requirements.map((r) => ({ value: r.id, label: `${r.code} — ${r.title}` }))}
          />
        </div>
      )}

      <Label>Başlık</Label>
      <TextInput value={form.title} onChange={set("title")} style={{ marginBottom: 13 }} />

      <Label>Ön koşul</Label>
      <TextInput value={form.preconditions} onChange={set("preconditions")} style={{ marginBottom: 13 }} />

      <Label>Adımlar — her satır bir adım</Label>
      <TextArea value={form.stepsText} onChange={set("stepsText")} rows={4} style={{ marginBottom: 13 }} />

      <Label>Beklenen sonuç</Label>
      <TextArea value={form.expected_result} onChange={set("expected_result")} rows={2} style={{ marginBottom: 14 }} />

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          fontSize: T.sm,
          color: C.ink,
          marginBottom: 16,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={form.is_critical}
          onChange={(e) => setForm({ ...form, is_critical: e.target.checked })}
          style={{ accentColor: C.brand, width: 15, height: 15 }}
        />
        Kritik test — tamamlanmadan kayıt kapatılamaz
      </label>

      <div style={{ display: "flex", gap: 8 }}>
        <Button
          onClick={submit}
          disabled={!form.code.trim() || !form.title.trim() || !form.expected_result.trim()}
        >
          Kaydet
        </Button>
        <Button variant="ghost" onClick={onCancel}>Vazgeç</Button>
      </div>
    </div>
  );
}

function Field({ C, label, children, strong }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ fontSize: T.xs, color: C.inkFaint, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: T.sm, color: strong ? C.ink : C.inkSoft, lineHeight: 1.65 }}>
        {children}
      </div>
    </div>
  );
}

function LinkButton({ C, onClick, children, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        fontFamily: F.body,
        fontSize: T.xs,
        color: C.brand,
        cursor: "pointer",
        textDecoration: "underline",
        textUnderlineOffset: 2,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
