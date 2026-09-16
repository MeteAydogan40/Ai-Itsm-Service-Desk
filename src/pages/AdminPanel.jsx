import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../lib/ThemeContext";
import { F, shadows } from "../lib/theme";
import Shell from "../components/Shell";
import { Tag, Button, IconButton, Label, TextInput, TextArea, Note, Empty, percent } from "../components/UI";
import { guard } from "../lib/session";
import {
  loadKnowledge, createKnowledge, updateKnowledge, deleteKnowledge,
  loadGroups, createGroup, updateGroup, deleteGroup,
  loadHealth, pingAI,
} from "../lib/admin";
import { backfillEmbeddings } from "../lib/embeddings";

const TABS = [
  { id: "kb", label: "Bilgi bankası" },
  { id: "groups", label: "Destek grupları" },
  { id: "system", label: "Sistem" },
];

const SOURCE_LABEL = {
  seed: "başlangıç verisi",
  technician: "teknisyen çözümü",
  admin: "elle eklendi",
};

export default function AdminPanel() {
  const { C, mode } = useTheme();
  const S = shadows(mode);
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("kb");

  useEffect(() => {
    const u = guard(navigate, ["admin"]);
    if (u) setUser(u);
  }, [navigate]);

  if (!user) return null;

  return (
    <Shell user={user} subtitle="yönetim">
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              fontFamily: F.body,
              fontSize: 13.5,
              fontWeight: tab === t.id ? 600 : 500,
              padding: "8px 15px",
              borderRadius: 9,
              border: `1px solid ${tab === t.id ? C.brand : C.line}`,
              background: tab === t.id ? C.brandSoft : "transparent",
              color: tab === t.id ? C.brand : C.inkSoft,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "kb" && <KnowledgeTab C={C} S={S} />}
      {tab === "groups" && <GroupsTab C={C} S={S} />}
      {tab === "system" && <SystemTab C={C} S={S} />}
    </Shell>
  );
}

/* ---------- Knowledge base ---------- */

function KnowledgeTab({ C, S }) {
  const [items, setItems] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadKnowledge().then(setItems);
  }, []);

  const sorted = (list) => [...list].sort((a, b) => a.category.localeCompare(b.category, "tr"));

  async function save(id, values) {
    setBusy(true);
    setError(null);
    const { entry, error } = await updateKnowledge(id, values);
    setBusy(false);
    if (error) return setError(error);
    setItems(items.map((i) => (i.id === id ? entry : i)));
    setEditingId(null);
  }

  async function add(values) {
    setBusy(true);
    setError(null);
    const { entry, error } = await createKnowledge(values);
    setBusy(false);
    if (error) return setError(error);
    setItems(sorted([...items, entry]));
    setAdding(false);
  }

  async function remove(item) {
    const { error } = await deleteKnowledge(item.id);
    if (error) return setError(error);
    setItems(items.filter((i) => i.id !== item.id));
  }

  const counts = {
    seed: items.filter((i) => i.source === "seed").length,
    technician: items.filter((i) => i.source === "technician").length,
    admin: items.filter((i) => i.source === "admin").length,
  };

  return (
    <div>
      <Card C={C} S={S}>
        <div style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.65, maxWidth: "72ch" }}>
          Buradaki kayıtlar iki işi birden yapıyor. Kategori listesi bu tablodan
          türüyor, yani yapay zeka bir çağrıyı sınıflandırırken yalnızca burada
          tanımlı kategoriler arasından seçim yapabiliyor. Adımlar ise çözüm
          önerilerinin kaynağı; semantik arama ile en alakalı olanlar modele
          bağlam olarak veriliyor.
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 14, fontSize: 12.5, color: C.inkFaint, flexWrap: "wrap" }}>
          <span>{items.length} kayıt</span>
          <span>{counts.seed} başlangıç</span>
          <span>{counts.technician} teknisyen katkısı</span>
          <span>{counts.admin} elle eklenen</span>
        </div>
      </Card>

      {error && <Note tone="danger" style={{ marginTop: 14 }}>{error}</Note>}

      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        {items.map((item) =>
          editingId === item.id ? (
            <KnowledgeForm
              key={item.id}
              initial={item}
              busy={busy}
              onSave={(v) => save(item.id, v)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <KnowledgeCard
              key={item.id}
              item={item}
              onEdit={() => setEditingId(item.id)}
              onRemove={() => remove(item)}
            />
          ),
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        {adding ? (
          <KnowledgeForm
            initial={{ category: "", keywords: [], steps: [] }}
            busy={busy}
            isNew
            onSave={add}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <Button variant="ghost" onClick={() => setAdding(true)}>
            Yeni kayıt ekle
          </Button>
        )}
      </div>
    </div>
  );
}

function KnowledgeCard({ item, onEdit, onRemove }) {
  const { C } = useTheme();
  const rate = percent(item.success_count, item.use_count);

  return (
    <div
      style={{
        border: `1px solid ${C.line}`,
        background: C.surfaceAlt,
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>{item.category}</span>
        <Tag text={SOURCE_LABEL[item.source] || item.source} tone="neutral" />
        {!item.embedding && <Tag text="vektörsüz" tone="warn" />}
        {rate !== null && (
          <span style={{ fontSize: 12, color: rate >= 60 ? C.brand : C.warn }}>
            {item.success_count}/{item.use_count} başarı
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <IconButton name="edit" onClick={onEdit} title="Düzenle" />
          <IconButton name="trash" onClick={onRemove} title="Sil" danger />
        </div>
      </div>

      {item.keywords?.length > 0 && (
        <div style={{ fontSize: 12, color: C.inkFaint, marginBottom: 8 }}>
          Anahtar kelimeler: {item.keywords.join(", ")}
        </div>
      )}

      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {(item.steps || []).map((s, i) => (
          <li key={i} style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.65 }}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

function KnowledgeForm({ initial, onSave, onCancel, busy, isNew }) {
  const { C } = useTheme();
  const [category, setCategory] = useState(initial.category || "");
  const [keywords, setKeywords] = useState((initial.keywords || []).join(", "));
  const [steps, setSteps] = useState((initial.steps || []).join("\n"));

  function submit() {
    onSave({
      category,
      keywords: keywords
        .split(",")
        .map((k) => k.trim().toLocaleLowerCase("tr"))
        .filter(Boolean),
      steps: steps.split("\n").map((s) => s.trim()).filter(Boolean),
    });
  }

  return (
    <div style={{ border: `1px solid ${C.brand}`, background: C.surface, borderRadius: 12, padding: "15px 16px" }}>
      <div style={{ fontSize: 12.5, color: C.brand, marginBottom: 12, fontWeight: 600 }}>
        {isNew ? "Yeni bilgi bankası kaydı" : `${initial.category} düzenleniyor`}
      </div>

      <Label>Kategori</Label>
      <TextInput
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="Örn: Ağ Bağlantısı"
        style={{ background: C.surfaceAlt, marginBottom: 12 }}
      />

      <Label hint="Bunlar yalnızca yapay zeka devre dışı kaldığında kullanılan yedek eşleştirme için. Normal çalışmada semantik arama devrede.">
        Anahtar kelimeler (virgülle ayırın)
      </Label>
      <TextInput
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
        placeholder="internet, vpn, bağlantı"
        style={{ background: C.surfaceAlt, marginBottom: 12 }}
      />

      <Label>Çözüm adımları (her satır bir adım)</Label>
      <TextArea
        value={steps}
        onChange={(e) => setSteps(e.target.value)}
        rows={5}
        style={{ background: C.surfaceAlt, marginBottom: 14 }}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button onClick={submit} disabled={busy || !category.trim()} style={{ padding: "8px 15px", fontSize: 13 }}>
          {busy ? "Kaydediliyor" : "Kaydet"}
        </Button>
        <Button variant="ghost" onClick={onCancel} style={{ padding: "8px 15px", fontSize: 13 }}>
          Vazgeç
        </Button>
        <span style={{ fontSize: 11.5, color: C.inkFaint }}>
          Kayıt sonrası vektör otomatik yenilenir.
        </span>
      </div>
    </div>
  );
}

/* ---------- Support groups ---------- */

function GroupsTab({ C, S }) {
  const [groups, setGroups] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadGroups().then(setGroups);
  }, []);

  const sorted = (list) => [...list].sort((a, b) => a.name.localeCompare(b.name, "tr"));

  async function save(id, values) {
    const { group, error } = await updateGroup(id, values);
    if (error) return setError(error);
    setGroups(groups.map((g) => (g.id === id ? group : g)));
    setEditingId(null);
  }

  async function add(values) {
    const { group, error } = await createGroup(values);
    if (error) return setError(error);
    setGroups(sorted([...groups, group]));
    setAdding(false);
  }

  async function remove(g) {
    setError(null);
    const { error } = await deleteGroup(g.id);
    if (error) return setError(error);
    setGroups(groups.filter((x) => x.id !== g.id));
  }

  return (
    <div>
      <Card C={C} S={S}>
        <div style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.65, maxWidth: "72ch" }}>
          Yapay zeka bir çağrıyı sınıflandırırken destek grubunu bu listeden
          seçiyor — kendi kafasına göre grup adı uydurmuyor. Yani buraya yeni
          bir ekip eklediğinizde model onu hemen kullanmaya başlıyor, modeli
          yeniden eğitmeye gerek yok.
        </div>
      </Card>

      {error && <Note tone="danger" style={{ marginTop: 14 }}>{error}</Note>}

      <div style={{ display: "grid", gap: 9, marginTop: 16 }}>
        {groups.map((g) =>
          editingId === g.id ? (
            <GroupForm
              key={g.id}
              initial={g}
              onSave={(v) => save(g.id, v)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div
              key={g.id}
              style={{
                border: `1px solid ${C.line}`,
                background: C.surfaceAlt,
                borderRadius: 11,
                padding: "13px 15px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{g.name}</div>
                {g.description && (
                  <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 3, lineHeight: 1.5 }}>
                    {g.description}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <IconButton name="edit" onClick={() => setEditingId(g.id)} title="Düzenle" />
                <IconButton name="trash" onClick={() => remove(g)} title="Sil" danger />
              </div>
            </div>
          ),
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        {adding ? (
          <GroupForm
            initial={{ name: "", description: "" }}
            isNew
            onSave={add}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <Button variant="ghost" onClick={() => setAdding(true)}>
            Yeni grup ekle
          </Button>
        )}
      </div>
    </div>
  );
}

function GroupForm({ initial, onSave, onCancel, isNew }) {
  const { C } = useTheme();
  const [name, setName] = useState(initial.name || "");
  const [description, setDescription] = useState(initial.description || "");

  return (
    <div style={{ border: `1px solid ${C.brand}`, background: C.surface, borderRadius: 11, padding: "14px 16px" }}>
      <div style={{ fontSize: 12.5, color: C.brand, marginBottom: 11, fontWeight: 600 }}>
        {isNew ? "Yeni destek grubu" : "Grup düzenleniyor"}
      </div>

      <Label>Grup adı</Label>
      <TextInput
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ background: C.surfaceAlt, marginBottom: 11 }}
      />

      <Label>Açıklama</Label>
      <TextInput
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Bu grup hangi konulara bakıyor?"
        style={{ background: C.surfaceAlt, marginBottom: 13 }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={() => onSave({ name, description })} disabled={!name.trim()} style={{ padding: "8px 15px", fontSize: 13 }}>
          Kaydet
        </Button>
        <Button variant="ghost" onClick={onCancel} style={{ padding: "8px 15px", fontSize: 13 }}>
          Vazgeç
        </Button>
      </div>
    </div>
  );
}

/* ---------- System ---------- */

function SystemTab({ C, S }) {
  const [health, setHealth] = useState(null);
  const [ai, setAi] = useState(null);
  const [checking, setChecking] = useState(false);
  const [backfilling, setBackfilling] = useState(null);

  useEffect(() => {
    loadHealth().then(setHealth);
  }, []);

  async function check() {
    setChecking(true);
    setAi(await pingAI());
    setChecking(false);
  }

  async function runBackfill() {
    setBackfilling({ kb: 0, tickets: 0, failed: 0, phase: "Başlıyor" });
    const report = await backfillEmbeddings(setBackfilling);
    setBackfilling({ ...report, phase: "Tamamlandı" });
    setHealth(await loadHealth());
    setTimeout(() => setBackfilling(null), 4000);
  }

  if (!health) return <Empty>Yükleniyor…</Empty>;

  const totalRecords = health.kbTotal + health.ticketTotal;
  const missing = health.kbMissing + health.ticketMissing;
  const coverage = percent(totalRecords - missing, totalRecords) ?? 100;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card C={C} S={S}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
          Semantik arama kapsamı
        </div>
        <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.6, marginBottom: 14, maxWidth: "70ch" }}>
          Vektörü olmayan kayıtlar semantik aramada bulunamaz. Benzer çağrı
          önerileri ve bilgi bankası eşleştirmesi yalnızca vektörlenmiş kayıtlar
          üzerinden çalışır.
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: F.display,
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: coverage === 100 ? C.brand : C.warn,
              lineHeight: 1,
            }}
          >
            %{coverage}
          </span>
          <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.5 }}>
            {health.kbTotal} bilgi bankası kaydı, {health.ticketTotal} çağrı
            <br />
            {missing > 0 ? `${missing} kayıt vektörsüz` : "tüm kayıtlar vektörlenmiş"}
          </div>
        </div>

        {missing > 0 && (
          <Button onClick={runBackfill} disabled={!!backfilling}>
            {backfilling
              ? `${backfilling.phase}: ${backfilling.kb + backfilling.tickets} kayıt`
              : "Eksik vektörleri tamamla"}
          </Button>
        )}
      </Card>

      <Card C={C} S={S}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
          Yapay zeka servisi
        </div>
        <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.6, marginBottom: 14, maxWidth: "70ch" }}>
          Servise erişilemediğinde sistem durmuyor; anahtar kelime tabanlı yerel
          mantığa düşüyor. Bu kontrol, hangi katmanın aktif olduğunu görmek için.
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Button variant="ghost" onClick={check} disabled={checking}>
            {checking ? "Kontrol ediliyor" : "Servisi kontrol et"}
          </Button>
          {ai && (
            <span style={{ fontSize: 13, color: ai.ok ? C.brand : C.danger }}>
              {ai.ok
                ? `Çalışıyor · ${ai.ms} ms · ${ai.dim} boyutlu vektör`
                : "Erişilemiyor · yerel katman devrede"}
            </span>
          )}
        </div>
      </Card>

      <Card C={C} S={S}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, marginBottom: 14 }}>
          Kayıt sayıları
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "14px 20px" }}>
          <Stat C={C} value={health.groups} label="destek grubu" />
          <Stat C={C} value={health.ticketTotal} label="kayıt" />
          <Stat C={C} value={health.requirements} label="gereksinim" />
          <Stat C={C} value={health.tests} label="test senaryosu" />
          <Stat C={C} value={health.executions} label="test yürütmesi" />
        </div>
      </Card>
    </div>
  );
}

/* ---------- Shared ---------- */

function Card({ C, S, children }) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 14,
        boxShadow: S.flat,
        padding: "20px 22px",
      }}
    >
      {children}
    </div>
  );
}

function Stat({ C, value, label }) {
  return (
    <div>
      <div
        style={{
          fontFamily: F.display,
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          color: C.ink,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 5 }}>{label}</div>
    </div>
  );
}
