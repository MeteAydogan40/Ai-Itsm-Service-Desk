import React, { useState, useRef } from "react";
import { useTheme } from "../lib/ThemeContext";
import { F } from "../lib/theme";
import {
  Tag, Button, IconButton, Label, TextInput, TextArea, Select,
  Note, Progress, testTypeTone, resultTone, dateTime,
} from "./UI";
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
    }
  }

  return (
    <div>
      {coverageNote && <Note style={{ marginBottom: 14, maxWidth: "68ch" }}>{coverageNote}</Note>}
      {locked && <Note style={{ marginBottom: 14 }}>{lockReason}</Note>}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 14,
          fontSize: 12.5,
          color: C.inkSoft,
          flexWrap: "wrap",
        }}
      >
        <span>{executed} / {tests.length} test yürütüldü</span>
        {critical.length > 0 && (
          <span style={{ color: criticalDone === critical.length ? C.brand : C.warn }}>
            {criticalDone} / {critical.length} kritik test tamamlandı
          </span>
        )}
        <Progress value={executed} total={tests.length} />
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {tests.map((t) =>
          editingId === t.id ? (
            <TestForm
              key={t.id}
              initial={t}
              requirements={requirements}
              onSave={async (patch) => {
                replace(await updateTest(t.id, patch));
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <TestCard
              key={t.id}
              test={t}
              requirement={reqById[t.requirement_id]}
              user={user}
              ticket={ticket}
              locked={locked}
              onEdit={() => setEditingId(t.id)}
              onRemove={() => remove(t)}
              onToggleCritical={async () => replace(await toggleCritical(t.id, !t.is_critical))}
              onExecuted={(execution) =>
                onChange(tests.map((x) => (x.id === t.id ? { ...x, latest: execution } : x)))
              }
            />
          ),
        )}
      </div>

      {!locked && (
        <div style={{ marginTop: 14 }}>
          {adding ? (
            <TestForm
              initial={{ code: nextTestCode(tests), test_type: "Pozitif", steps: [] }}
              requirements={requirements}
              onSave={handleAdd}
              onCancel={() => setAdding(false)}
              isNew
            />
          ) : (
            <Button variant="ghost" onClick={() => setAdding(true)} style={{ padding: "7px 14px", fontSize: 13 }}>
              Elle test ekle
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function TestCard({ test: t, requirement, user, ticket, locked, onEdit, onRemove, onToggleCritical, onExecuted }) {
  const { C } = useTheme();
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

  const borderColor =
    status === "Başarısız" ? `${C.danger}66`
    : status === "Başarılı" ? `${C.brand}55`
    : t.is_critical ? `${C.warn}44`
    : C.line;

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        background: status === "Başarılı" ? C.brandTint : C.surfaceAlt,
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, color: C.brand }}>
          {t.code}
        </span>
        <Tag text={t.test_type} tone={testTypeTone(t.test_type)} />
        {t.is_critical && <Tag text="Kritik" tone="danger" />}
        {status && <Tag text={status} tone={resultTone(status)} />}
        {t.created_by === "human" && (
          <span style={{ fontSize: 11.5, color: C.info }}>elle eklendi</span>
        )}

        {!locked && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <IconButton
              name="star"
              onClick={onToggleCritical}
              title={t.is_critical ? "Kritikten çıkar" : "Kritik yap"}
            />
            <IconButton name="edit" onClick={onEdit} title="Düzenle" />
            <IconButton name="trash" onClick={onRemove} title="Sil" danger />
          </div>
        )}
      </div>

      <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, lineHeight: 1.45 }}>
        {t.title}
      </div>

      {requirement && (
        <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 6 }}>
          Doğruladığı gereksinim:{" "}
          <span style={{ fontFamily: F.mono }}>{requirement.code}</span> · {requirement.title}
        </div>
      )}

      {t.is_critical && t.critical_reason && (
        <div style={{ fontSize: 12.5, color: C.warn, marginTop: 6, lineHeight: 1.55 }}>
          Kritik sayılma sebebi: {t.critical_reason}
        </div>
      )}

      <LinkButton onClick={() => setOpen((v) => !v)} style={{ marginTop: 10 }}>
        {open ? "Detayı gizle" : "Adımları ve beklenen sonucu gör"}
      </LinkButton>

      {open && (
        <div style={{ marginTop: 11 }}>
          {t.preconditions && (
            <Field label="Ön koşul">{t.preconditions}</Field>
          )}

          {t.steps?.length > 0 && (
            <div style={{ marginBottom: 11 }}>
              <div style={{ fontSize: 12, color: C.inkFaint, marginBottom: 5 }}>Adımlar</div>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {t.steps.map((s, i) => (
                  <li key={i} style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.7 }}>{s}</li>
                ))}
              </ol>
            </div>
          )}

          <Field label="Beklenen sonuç" strong>{t.expected_result}</Field>

          {!locked && (
            <>
              <TextArea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Açıklama veya gözlem. Başarısız işaretlerken zorunlu."
                rows={2}
                style={{ background: C.surface, marginBottom: 9 }}
              />

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.docx"
                  onChange={(e) => setEvidence(e.target.files?.[0] || null)}
                  style={{ display: "none" }}
                />
                <Button
                  variant="ghost"
                  onClick={() => fileRef.current?.click()}
                  style={{ padding: "6px 12px", fontSize: 12.5 }}
                >
                  Kanıt ekle
                </Button>
                {evidence && (
                  <span style={{ fontSize: 12.5, color: C.inkSoft }}>
                    {evidence.name} · {humanSize(evidence.size)}
                    <LinkButton onClick={() => setEvidence(null)} style={{ marginLeft: 6 }}>
                      kaldır
                    </LinkButton>
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {RESULTS.map((r) => (
                  <Button
                    key={r}
                    variant={r === "Başarılı" ? "soft" : r === "Başarısız" ? "danger" : "ghost"}
                    onClick={() => mark(r)}
                    disabled={busy}
                    style={{ padding: "7px 14px", fontSize: 13 }}
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
            marginTop: 11,
            paddingTop: 10,
            borderTop: `1px dashed ${C.line}`,
            fontSize: 12.5,
            color: C.inkSoft,
            lineHeight: 1.6,
          }}
        >
          <span style={{ color: status === "Başarısız" ? C.danger : C.inkSoft }}>
            {latest.executed_by} tarafından {status} işaretlendi
          </span>
          {latest.note && <div style={{ marginTop: 4 }}>{latest.note}</div>}
          <LinkButton
            onClick={async () => setHistory(history ? null : await loadTestHistory(t.id))}
            style={{ marginTop: 6, display: "block" }}
          >
            {history ? "Geçmişi gizle" : "Yürütme geçmişi"}
          </LinkButton>
        </div>
      )}

      {history && (
        <div style={{ marginTop: 9, padding: "10px 12px", background: C.surfaceSunken, borderRadius: 9 }}>
          {history.map((h) => (
            <div key={h.id} style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 8, lineHeight: 1.55 }}>
              <span style={{ color: h.result === "Başarısız" ? C.danger : C.brand, fontWeight: 600 }}>
                {h.result}
              </span>
              {" · "}{h.executed_by}{" · "}{dateTime(h.executed_at)}
              {h.note && <div style={{ marginTop: 2 }}>{h.note}</div>}
              {h.attachments?.public_url && (
                <a
                  href={h.attachments.public_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: C.info, fontSize: 12 }}
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

function TestForm({ initial, requirements, onSave, onCancel, isNew }) {
  const { C } = useTheme();
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
    <div style={{ border: `1px solid ${C.brand}`, background: C.surface, borderRadius: 12, padding: "15px 16px" }}>
      <div style={{ fontFamily: F.mono, fontSize: 12, color: C.brand, marginBottom: 12 }}>
        {isNew ? "Yeni test" : `${initial.code} düzenleniyor`}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 11, flexWrap: "wrap" }}>
        <div style={{ width: 110 }}>
          <Label>Kod</Label>
          <TextInput value={form.code} onChange={set("code")} />
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <Label>Tip</Label>
          <Select value={form.test_type} onChange={set("test_type")} options={TYPES} />
        </div>
      </div>

      {isNew && requirements?.length > 0 && (
        <div style={{ marginBottom: 11 }}>
          <Label>Doğruladığı gereksinim</Label>
          <Select
            value={form.requirement_id}
            onChange={set("requirement_id")}
            options={requirements.map((r) => ({ value: r.id, label: `${r.code} — ${r.title}` }))}
          />
        </div>
      )}

      <Label>Başlık</Label>
      <TextInput value={form.title} onChange={set("title")} style={{ marginBottom: 11 }} />

      <Label>Ön koşul</Label>
      <TextInput value={form.preconditions} onChange={set("preconditions")} style={{ marginBottom: 11 }} />

      <Label>Adımlar (her satır bir adım)</Label>
      <TextArea value={form.stepsText} onChange={set("stepsText")} rows={4} style={{ marginBottom: 11 }} />

      <Label>Beklenen sonuç</Label>
      <TextArea value={form.expected_result} onChange={set("expected_result")} rows={2} style={{ marginBottom: 12 }} />

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: C.ink,
          marginBottom: 14,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={form.is_critical}
          onChange={(e) => setForm({ ...form, is_critical: e.target.checked })}
          style={{ accentColor: C.brand }}
        />
        Kritik test — tamamlanmadan kayıt kapatılamaz
      </label>

      <div style={{ display: "flex", gap: 8 }}>
        <Button
          onClick={submit}
          disabled={!form.code.trim() || !form.title.trim() || !form.expected_result.trim()}
          style={{ padding: "8px 15px", fontSize: 13 }}
        >
          Kaydet
        </Button>
        <Button variant="ghost" onClick={onCancel} style={{ padding: "8px 15px", fontSize: 13 }}>
          Vazgeç
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children, strong }) {
  const { C } = useTheme();
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ fontSize: 12, color: C.inkFaint, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: strong ? C.ink : C.inkSoft, lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  );
}

function LinkButton({ onClick, children, style }) {
  const { C } = useTheme();
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        fontFamily: F.body,
        fontSize: 12,
        color: C.inkFaint,
        cursor: "pointer",
        textDecoration: "underline",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
