import React, { useState } from "react";
import { useTheme } from "../lib/ThemeContext";
import { F, T } from "../lib/theme";
import {
  Tag, Button, IconButton, Label, TextInput, TextArea, Select,
  Note, Progress, reqTypeTone, priorityTone,
} from "./UI";
import { useToast } from "./Toast";
import { updateRequirement, approveRequirement, deleteRequirement } from "../lib/documents";

const TYPES = ["Fonksiyonel", "Fonksiyonel Olmayan", "Yetki", "Veri", "Entegrasyon"];
const PRIORITIES = ["Yüksek", "Orta", "Düşük"];

export default function Requirements({ items, onChange, openQuestions, summary, locked, lockReason }) {
  const { C } = useTheme();
  const notify = useToast();
  const [editingId, setEditingId] = useState(null);

  if (!items?.length) return null;

  const approved = items.filter((r) => r.approved).length;
  const ambiguous = items.filter((r) => r.ambiguous).length;

  async function toggleApprove(r) {
    const updated = await approveRequirement(r.id, !r.approved);
    onChange(items.map((i) => (i.id === r.id ? updated : i)));
    notify(updated.approved ? `${r.code} onaylandı` : `${r.code} onayı kaldırıldı`);
  }

  async function saveEdit(r, patch) {
    const updated = await updateRequirement(r.id, patch);
    onChange(items.map((i) => (i.id === r.id ? updated : i)));
    setEditingId(null);
    notify(`${r.code} güncellendi`);
  }

  async function remove(r) {
    await deleteRequirement(r.id);
    onChange(items.filter((i) => i.id !== r.id));
    notify(`${r.code} silindi`, "warn");
  }

  return (
    <div>
      {summary && <Note style={{ marginBottom: 16, maxWidth: "68ch" }}>{summary}</Note>}
      {locked && <Note style={{ marginBottom: 16 }}>{lockReason}</Note>}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 16,
          fontSize: T.xs,
          color: C.inkFaint,
          flexWrap: "wrap",
        }}
      >
        <span>{approved} / {items.length} onaylandı</span>
        {ambiguous > 0 && <span style={{ color: C.warn }}>{ambiguous} belirsiz</span>}
        <Progress value={approved} total={items.length} />
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {items.map((r) =>
          editingId === r.id ? (
            <EditForm
              key={r.id}
              C={C}
              requirement={r}
              onSave={(patch) => saveEdit(r, patch)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <RequirementCard
              key={r.id}
              C={C}
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
        <Note tone="warn" style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 500, marginBottom: 9 }}>
            Dokümanın cevaplamadığı sorular
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {openQuestions.map((q, i) => (
              <li key={i} style={{ color: C.inkSoft, lineHeight: 1.7 }}>{q}</li>
            ))}
          </ul>
          <div style={{ fontSize: T.xs, color: C.inkSoft, marginTop: 10 }}>
            Geliştirmeye başlamadan önce talep eden birimle netleştirilmesi önerilir.
          </div>
        </Note>
      )}
    </div>
  );
}

function RequirementCard({ C, requirement: r, locked, onEdit, onApprove, onRemove }) {
  const [showSource, setShowSource] = useState(false);

  return (
    <div
      style={{
        border: `1px solid ${r.approved ? `${C.ok}55` : r.ambiguous ? `${C.warn}44` : C.line}`,
        background: r.approved ? C.okSoft : C.surface,
        borderRadius: 9,
        padding: "15px 17px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9, flexWrap: "wrap" }}>
        <span style={{ fontFamily: F.mono, fontSize: T.xs, fontWeight: 500, color: C.brand }}>
          {r.code}
        </span>
        <Tag text={r.req_type} tone={reqTypeTone(r.req_type)} />
        <Tag text={r.priority} tone={priorityTone(r.priority)} />
        {r.confidence !== "Yüksek" && (
          <span style={{ fontSize: T.xs, color: C.inkFaint }}>
            çıkarım güveni {r.confidence.toLocaleLowerCase("tr")}
          </span>
        )}
        {r.edited_by_human && (
          <span style={{ fontSize: T.xs, color: C.brand }}>uzman düzenledi</span>
        )}

        {!locked && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            <IconButton name="edit" onClick={onEdit} title="Düzenle" />
            <IconButton name="trash" onClick={onRemove} title="Sil" danger />
          </span>
        )}
      </div>

      <div style={{ fontSize: T.base, fontWeight: 500, lineHeight: 1.45 }}>{r.title}</div>

      {r.description && (
        <div style={{ fontSize: T.sm, color: C.inkSoft, lineHeight: 1.65, marginTop: 7, maxWidth: "66ch" }}>
          {r.description}
        </div>
      )}

      {r.ambiguous && r.ambiguity_note && (
        <Note tone="warn" style={{ marginTop: 12, fontSize: T.xs }}>
          <strong style={{ fontWeight: 500 }}>Belirsiz:</strong> {r.ambiguity_note}
        </Note>
      )}

      {r.source_quote && (
        <div style={{ marginTop: 12 }}>
          <LinkButton C={C} onClick={() => setShowSource((v) => !v)}>
            {showSource ? "Dayanağı gizle" : "Dokümandaki dayanağı gör"}
          </LinkButton>
          {showSource && (
            <div
              style={{
                marginTop: 9,
                paddingLeft: 13,
                borderLeft: `2px solid ${C.lineStrong}`,
                fontSize: T.sm,
                color: C.inkSoft,
                lineHeight: 1.7,
              }}
            >
              {r.source_quote}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        {locked ? (
          <span style={{ fontSize: T.xs, color: r.approved ? C.ok : C.inkFaint }}>
            {r.approved ? "Onaylandı" : "Onay bekliyor"}
          </span>
        ) : (
          <Button variant={r.approved ? "ghost" : "secondary"} onClick={onApprove}>
            {r.approved ? "Onayı kaldır" : "Onayla"}
          </Button>
        )}
      </div>
    </div>
  );
}

function EditForm({ C, requirement: r, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: r.title,
    description: r.description || "",
    req_type: r.req_type,
    priority: r.priority,
  });

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <div style={{ border: `1px solid ${C.brand}`, background: C.surface, borderRadius: 9, padding: "16px 18px" }}>
      <div style={{ fontFamily: F.mono, fontSize: T.xs, color: C.brand, marginBottom: 13 }}>
        {r.code} düzenleniyor
      </div>

      <Label>Başlık</Label>
      <TextInput value={form.title} onChange={set("title")} style={{ marginBottom: 13 }} />

      <Label>Açıklama</Label>
      <TextArea value={form.description} onChange={set("description")} style={{ marginBottom: 13 }} />

      <div style={{ display: "flex", gap: 13, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <Label>Tip</Label>
          <Select value={form.req_type} onChange={set("req_type")} options={TYPES} />
        </div>
        <div style={{ flex: 1, minWidth: 130 }}>
          <Label>Öncelik</Label>
          <Select value={form.priority} onChange={set("priority")} options={PRIORITIES} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={() => onSave({ ...form, ambiguous: false })} disabled={!form.title.trim()}>
          Kaydet
        </Button>
        <Button variant="ghost" onClick={onCancel}>Vazgeç</Button>
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
