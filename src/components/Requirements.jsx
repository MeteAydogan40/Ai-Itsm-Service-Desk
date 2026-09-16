import React, { useState } from "react";
import { useTheme } from "../lib/ThemeContext";
import { F } from "../lib/theme";
import {
  Tag, Button, IconButton, Label, TextInput, TextArea, Select,
  Note, Progress, reqTypeTone, priorityTone,
} from "./UI";
import { updateRequirement, approveRequirement, deleteRequirement } from "../lib/documents";

const TYPES = ["Fonksiyonel", "Fonksiyonel Olmayan", "Yetki", "Veri", "Entegrasyon"];
const PRIORITIES = ["Yüksek", "Orta", "Düşük"];

export default function Requirements({ items, onChange, openQuestions, summary, locked, lockReason }) {
  const { C } = useTheme();
  const [editingId, setEditingId] = useState(null);

  if (!items?.length) return null;

  const approved = items.filter((r) => r.approved).length;
  const ambiguous = items.filter((r) => r.ambiguous).length;

  async function toggleApprove(r) {
    const updated = await approveRequirement(r.id, !r.approved);
    onChange(items.map((i) => (i.id === r.id ? updated : i)));
  }

  async function saveEdit(r, patch) {
    const updated = await updateRequirement(r.id, patch);
    onChange(items.map((i) => (i.id === r.id ? updated : i)));
    setEditingId(null);
  }

  async function remove(r) {
    await deleteRequirement(r.id);
    onChange(items.filter((i) => i.id !== r.id));
  }

  return (
    <div>
      {summary && (
        <Note style={{ marginBottom: 14, maxWidth: "68ch" }}>{summary}</Note>
      )}

      {locked && <Note style={{ marginBottom: 14 }}>{lockReason}</Note>}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 14,
          fontSize: 12.5,
          color: C.inkSoft,
          flexWrap: "wrap",
        }}
      >
        <span>{approved} / {items.length} onaylandı</span>
        {ambiguous > 0 && (
          <span style={{ color: C.warn }}>{ambiguous} tanesi belirsiz işaretli</span>
        )}
        <Progress value={approved} total={items.length} />
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {items.map((r) =>
          editingId === r.id ? (
            <EditForm
              key={r.id}
              requirement={r}
              onSave={(patch) => saveEdit(r, patch)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <RequirementCard
              key={r.id}
              requirement={r}
              locked={locked}
              onEdit={() => setEditingId(r.id)}
              onApprove={() => toggleApprove(r)}
              onRemove={() => remove(r)}
            />
          ),
        )}
      </div>

      {openQuestions?.length > 0 && (
        <Note tone="warn" style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            Dokümanın cevaplamadığı sorular
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {openQuestions.map((q, i) => (
              <li key={i} style={{ color: C.inkSoft, lineHeight: 1.65 }}>{q}</li>
            ))}
          </ul>
          <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 9 }}>
            Geliştirmeye başlamadan önce talep eden birimle netleştirilmesi önerilir.
          </div>
        </Note>
      )}
    </div>
  );
}

function RequirementCard({ requirement: r, locked, onEdit, onApprove, onRemove }) {
  const { C } = useTheme();
  const [showSource, setShowSource] = useState(false);

  const borderColor = r.approved
    ? `${C.brand}66`
    : r.ambiguous
    ? `${C.warn}55`
    : C.line;

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        background: r.approved ? C.brandTint : C.surfaceAlt,
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, color: C.brand }}>
          {r.code}
        </span>
        <Tag text={r.req_type} tone={reqTypeTone(r.req_type)} />
        <Tag text={r.priority} tone={priorityTone(r.priority)} />
        {r.confidence !== "Yüksek" && (
          <span style={{ fontSize: 11.5, color: C.inkFaint }}>
            çıkarım güveni {r.confidence.toLocaleLowerCase("tr")}
          </span>
        )}
        {r.edited_by_human && (
          <span style={{ fontSize: 11.5, color: C.info }}>uzman düzenledi</span>
        )}

        {!locked && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <IconButton name="edit" onClick={onEdit} title="Düzenle" />
            <IconButton name="trash" onClick={onRemove} title="Sil" danger />
          </div>
        )}
      </div>

      <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, lineHeight: 1.45 }}>
        {r.title}
      </div>

      {r.description && (
        <div style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.6, marginTop: 6, maxWidth: "66ch" }}>
          {r.description}
        </div>
      )}

      {r.ambiguous && r.ambiguity_note && (
        <Note tone="warn" style={{ marginTop: 10, fontSize: 12.5 }}>
          <strong>Belirsiz:</strong> {r.ambiguity_note}
        </Note>
      )}

      {r.source_quote && (
        <div style={{ marginTop: 10 }}>
          <LinkButton onClick={() => setShowSource((v) => !v)}>
            {showSource ? "Dayanağı gizle" : "Dokümandaki dayanağı gör"}
          </LinkButton>
          {showSource && (
            <div
              style={{
                marginTop: 8,
                paddingLeft: 12,
                borderLeft: `2px solid ${C.lineStrong}`,
                fontSize: 12.5,
                color: C.inkSoft,
                lineHeight: 1.65,
                fontStyle: "italic",
              }}
            >
              {r.source_quote}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {locked ? (
          <span style={{ fontSize: 12.5, color: r.approved ? C.brand : C.inkFaint, fontWeight: r.approved ? 600 : 400 }}>
            {r.approved ? "Onaylandı" : "Onay bekliyor"}
          </span>
        ) : (
          <Button
            variant={r.approved ? "soft" : "ghost"}
            onClick={onApprove}
            style={{ padding: "6px 13px", fontSize: 12.5 }}
          >
            {r.approved ? "Onaylandı" : "Onayla"}
          </Button>
        )}
      </div>
    </div>
  );
}

function EditForm({ requirement: r, onSave, onCancel }) {
  const { C } = useTheme();
  const [form, setForm] = useState({
    title: r.title,
    description: r.description || "",
    req_type: r.req_type,
    priority: r.priority,
  });

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <div
      style={{
        border: `1px solid ${C.brand}`,
        background: C.surface,
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div style={{ fontFamily: F.mono, fontSize: 12, color: C.brand, marginBottom: 10 }}>
        {r.code} düzenleniyor
      </div>

      <Label>Başlık</Label>
      <TextInput value={form.title} onChange={set("title")} style={{ marginBottom: 11 }} />

      <Label>Açıklama</Label>
      <TextArea value={form.description} onChange={set("description")} style={{ marginBottom: 11 }} />

      <div style={{ display: "flex", gap: 11, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 150 }}>
          <Label>Tip</Label>
          <Select value={form.req_type} onChange={set("req_type")} options={TYPES} />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <Label>Öncelik</Label>
          <Select value={form.priority} onChange={set("priority")} options={PRIORITIES} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <Button
          onClick={() => onSave({ ...form, ambiguous: false })}
          disabled={!form.title.trim()}
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

function LinkButton({ onClick, children }) {
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
      }}
    >
      {children}
    </button>
  );
}
