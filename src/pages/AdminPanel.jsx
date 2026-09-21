import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../lib/ThemeContext";
import { F, T } from "../lib/theme";
import Shell from "../components/Shell";
import {
  Tag, Button, IconButton, Label, TextInput, TextArea,
  Note, Empty, Skeleton, Section, percent,
} from "../components/UI";
import { useToast } from "../components/Toast";
import { guard } from "../lib/session";
import {
  loadKnowledge, createKnowledge, updateKnowledge, deleteKnowledge,
  loadGroups, createGroup, updateGroup, deleteGroup,
  loadHealth, pingAI,
} from "../lib/admin";
import { backfillEmbeddings } from "../lib/embeddings";
import { buildReport, PERIODS } from "../lib/report";
import ReportDocument from "../components/ReportDocument";

const TABS = [
  { id: "kb", label: "Bilgi bankası" },
  { id: "groups", label: "Destek grupları" },
  { id: "system", label: "Sistem" },
  { id: "reports", label: "Raporlar" },
];

const SOURCE_LABEL = { seed: "başlangıç", technician: "teknisyen", admin: "elle" };

export default function AdminPanel() {
  const { C } = useTheme();
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
      <div style={{ display: "flex", gap: 2, marginBottom: 8 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              fontFamily: F.body,
              fontSize: T.sm,
              fontWeight: tab === t.id ? 500 : 400,
              padding: "8px 14px",
              borderRadius: 7,
              border: "none",
              background: tab === t.id ? C.brandSoft : "transparent",
              color: tab === t.id ? C.brand : C.inkSoft,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "kb" && <KnowledgeTab C={C} />}
      {tab === "groups" && <GroupsTab C={C} />}
      {tab === "system" && <SystemTab C={C} />}
      {tab === "reports" && <ReportsTab C={C} user={user} />}
    </Shell>
  );
}

/* ---------- Bilgi bankası ---------- */

function KnowledgeTab({ C }) {
  const notify = useToast();
  const [items, setItems] = useState(null);
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
    notify(`${entry.category} güncellendi`);
  }

  async function add(values) {
    setBusy(true);
    setError(null);
    const { entry, error } = await createKnowledge(values);
    setBusy(false);
    if (error) return setError(error);
    setItems(sorted([...items, entry]));
    setAdding(false);
    notify(`${entry.category} eklendi`);
  }

  async function remove(item) {
    const { error } = await deleteKnowledge(item.id);
    if (error) return setError(error);
    setItems(items.filter((i) => i.id !== item.id));
    notify(`${item.category} silindi`, "warn");
  }

  if (!items) return <Skeleton lines={6} style={{ marginTop: 32 }} />;

  const counts = {
    seed: items.filter((i) => i.source === "seed").length,
    technician: items.filter((i) => i.source === "technician").length,
    admin: items.filter((i) => i.source === "admin").length,
  };

  return (
    <>
      <Section
        title="Bilgi bankası"
        description="Kategori listesi ve çözüm önerilerinin kaynağı"
      >
        <p style={{ margin: 0, fontSize: T.sm, color: C.inkSoft, lineHeight: 1.65, maxWidth: "68ch" }}>
          Yapay zeka bir çağrıyı sınıflandırırken yalnızca burada tanımlı kategoriler
          arasından seçim yapabiliyor. Adımlar ise çözüm önerilerinin kaynağı; semantik
          arama ile en alakalı olanlar modele bağlam olarak veriliyor.
        </p>

        <div
          style={{
            display: "flex",
            gap: 20,
            marginTop: 16,
            fontSize: T.xs,
            color: C.inkFaint,
            flexWrap: "wrap",
          }}
        >
          <span>{items.length} kayıt</span>
          <span>{counts.seed} başlangıç</span>
          <span>{counts.technician} teknisyen katkısı</span>
          <span>{counts.admin} elle eklenen</span>
        </div>

        {error && <Note tone="danger" style={{ marginTop: 16 }}>{error}</Note>}

        <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
          {items.map((item) =>
            editingId === item.id ? (
              <KnowledgeForm
                key={item.id}
                C={C}
                initial={item}
                busy={busy}
                onSave={(v) => save(item.id, v)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <KnowledgeCard
                key={item.id}
                C={C}
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
              C={C}
              initial={{ category: "", keywords: [], steps: [] }}
              busy={busy}
              isNew
              onSave={add}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              Yeni kayıt ekle
            </Button>
          )}
        </div>
      </Section>
    </>
  );
}

function KnowledgeCard({ C, item, onEdit, onRemove }) {
  const rate = percent(item.success_count, item.use_count);

  return (
    <div
      style={{
        border: `1px solid ${C.line}`,
        background: C.surface,
        borderRadius: 9,
        padding: "15px 17px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9, flexWrap: "wrap" }}>
        <span style={{ fontSize: T.base, fontWeight: 500 }}>{item.category}</span>
        <Tag text={SOURCE_LABEL[item.source] || item.source} tone="neutral" />
        {!item.embedding && <Tag text="vektörsüz" tone="warn" />}
        {rate !== null && (
          <span style={{ fontSize: T.xs, color: rate >= 60 ? C.ok : C.warn }}>
            {item.success_count}/{item.use_count} başarı
          </span>
        )}
        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <IconButton name="edit" onClick={onEdit} title="Düzenle" />
          <IconButton name="trash" onClick={onRemove} title="Sil" danger />
        </span>
      </div>

      {item.keywords?.length > 0 && (
        <div style={{ fontSize: T.xs, color: C.inkFaint, marginBottom: 10 }}>
          {item.keywords.join(", ")}
        </div>
      )}

      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {(item.steps || []).map((s, i) => (
          <li key={i} style={{ fontSize: T.sm, color: C.inkSoft, lineHeight: 1.7 }}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

function KnowledgeForm({ C, initial, onSave, onCancel, busy, isNew }) {
  const [category, setCategory] = useState(initial.category || "");
  const [keywords, setKeywords] = useState((initial.keywords || []).join(", "));
  const [steps, setSteps] = useState((initial.steps || []).join("\n"));

  return (
    <div style={{ border: `1px solid ${C.brand}`, background: C.surface, borderRadius: 9, padding: "17px 18px" }}>
      <div style={{ fontSize: T.sm, color: C.brand, marginBottom: 14, fontWeight: 500 }}>
        {isNew ? "Yeni bilgi bankası kaydı" : `${initial.category} düzenleniyor`}
      </div>

      <Label>Kategori</Label>
      <TextInput
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="Örn: Ağ Bağlantısı"
        style={{ marginBottom: 14 }}
      />

      <Label hint="Yalnızca yapay zeka devre dışı kaldığında kullanılan yedek eşleştirme için. Normal çalışmada semantik arama devrede.">
        Anahtar kelimeler
      </Label>
      <TextInput
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
        placeholder="internet, vpn, bağlantı"
        style={{ marginBottom: 14 }}
      />

      <Label>Çözüm adımları — her satır bir adım</Label>
      <TextArea
        value={steps}
        onChange={(e) => setSteps(e.target.value)}
        rows={5}
        style={{ marginBottom: 16 }}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button
          onClick={() =>
            onSave({
              category,
              keywords: keywords.split(",").map((k) => k.trim().toLocaleLowerCase("tr")).filter(Boolean),
              steps: steps.split("\n").map((s) => s.trim()).filter(Boolean),
            })
          }
          disabled={busy || !category.trim()}
        >
          {busy ? "Kaydediliyor" : "Kaydet"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Vazgeç</Button>
        <span style={{ fontSize: T.xs, color: C.inkFaint }}>
          Kayıt sonrası vektör otomatik yenilenir.
        </span>
      </div>
    </div>
  );
}

/* ---------- Destek grupları ---------- */

function GroupsTab({ C }) {
  const notify = useToast();
  const [groups, setGroups] = useState(null);
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
    notify(`${group.name} güncellendi`);
  }

  async function add(values) {
    const { group, error } = await createGroup(values);
    if (error) return setError(error);
    setGroups(sorted([...groups, group]));
    setAdding(false);
    notify(`${group.name} eklendi`);
  }

  async function remove(g) {
    setError(null);
    const { error } = await deleteGroup(g.id);
    if (error) return setError(error);
    setGroups(groups.filter((x) => x.id !== g.id));
    notify(`${g.name} silindi`, "warn");
  }

  if (!groups) return <Skeleton lines={5} style={{ marginTop: 32 }} />;

  return (
    <Section title="Destek grupları" description="Çağrıların yönlendirileceği ekipler">
      <p style={{ margin: 0, fontSize: T.sm, color: C.inkSoft, lineHeight: 1.65, maxWidth: "68ch" }}>
        Yapay zeka destek grubunu bu listeden seçiyor, kendi kafasına göre uydurmuyor.
        Buraya yeni bir ekip eklediğinizde model onu hemen kullanmaya başlıyor; modeli
        yeniden eğitmeye gerek yok.
      </p>

      {error && <Note tone="danger" style={{ marginTop: 16 }}>{error}</Note>}

      <div style={{ display: "grid", gap: 8, marginTop: 20 }}>
        {groups.map((g) =>
          editingId === g.id ? (
            <GroupForm
              key={g.id}
              C={C}
              initial={g}
              onSave={(v) => save(g.id, v)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div
              key={g.id}
              style={{
                border: `1px solid ${C.line}`,
                background: C.surface,
                borderRadius: 9,
                padding: "13px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: T.sm, fontWeight: 500 }}>{g.name}</span>
                {g.description && (
                  <span style={{ display: "block", fontSize: T.xs, color: C.inkSoft, marginTop: 3 }}>
                    {g.description}
                  </span>
                )}
              </span>
              <span style={{ display: "flex", gap: 4 }}>
                <IconButton name="edit" onClick={() => setEditingId(g.id)} title="Düzenle" />
                <IconButton name="trash" onClick={() => remove(g)} title="Sil" danger />
              </span>
            </div>
          ),
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        {adding ? (
          <GroupForm
            C={C}
            initial={{ name: "", description: "" }}
            isNew
            onSave={add}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Yeni grup ekle
          </Button>
        )}
      </div>
    </Section>
  );
}

function GroupForm({ C, initial, onSave, onCancel, isNew }) {
  const [name, setName] = useState(initial.name || "");
  const [description, setDescription] = useState(initial.description || "");

  return (
    <div style={{ border: `1px solid ${C.brand}`, background: C.surface, borderRadius: 9, padding: "16px 18px" }}>
      <div style={{ fontSize: T.sm, color: C.brand, marginBottom: 13, fontWeight: 500 }}>
        {isNew ? "Yeni destek grubu" : "Grup düzenleniyor"}
      </div>

      <Label>Grup adı</Label>
      <TextInput value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 13 }} />

      <Label>Açıklama</Label>
      <TextInput
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Bu grup hangi konulara bakıyor?"
        style={{ marginBottom: 16 }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={() => onSave({ name, description })} disabled={!name.trim()}>
          Kaydet
        </Button>
        <Button variant="ghost" onClick={onCancel}>Vazgeç</Button>
      </div>
    </div>
  );
}

/* ---------- Sistem ---------- */

function SystemTab({ C }) {
  const notify = useToast();
  const [health, setHealth] = useState(null);
  const [ai, setAi] = useState(null);
  const [checking, setChecking] = useState(false);
  const [backfilling, setBackfilling] = useState(null);

  useEffect(() => {
    loadHealth().then(setHealth);
  }, []);

  async function check() {
    setChecking(true);
    const result = await pingAI();
    setAi(result);
    setChecking(false);
    notify(result.ok ? "Yapay zeka servisi çalışıyor" : "Servise erişilemiyor", result.ok ? "ok" : "danger");
  }

  async function runBackfill() {
    setBackfilling({ kb: 0, tickets: 0, failed: 0, phase: "Başlıyor" });
    const report = await backfillEmbeddings(setBackfilling);
    setBackfilling({ ...report, phase: "Tamamlandı" });
    setHealth(await loadHealth());
    notify(`${report.kb + report.tickets} kayıt vektörlendi`);
    setTimeout(() => setBackfilling(null), 4000);
  }

  if (!health) return <Skeleton lines={5} style={{ marginTop: 32 }} />;

  const totalRecords = health.kbTotal + health.ticketTotal;
  const missing = health.kbMissing + health.ticketMissing;
  const coverage = percent(totalRecords - missing, totalRecords) ?? 100;

  return (
    <>
      <Section title="Semantik arama" description="Vektör kapsamı">
        <p style={{ margin: 0, fontSize: T.sm, color: C.inkSoft, lineHeight: 1.65, maxWidth: "68ch" }}>
          Vektörü olmayan kayıtlar semantik aramada bulunamaz. Benzer çağrı önerileri ve
          bilgi bankası eşleştirmesi yalnızca vektörlenmiş kayıtlar üzerinden çalışır.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 18, margin: "20px 0", flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: T.xl,
              fontWeight: 500,
              letterSpacing: "-0.03em",
              color: coverage === 100 ? C.ok : C.warn,
              lineHeight: 1,
            }}
          >
            %{coverage}
          </span>
          <span style={{ fontSize: T.sm, color: C.inkSoft, lineHeight: 1.55 }}>
            {health.kbTotal} bilgi bankası kaydı, {health.ticketTotal} çağrı
            <br />
            {missing > 0 ? `${missing} kayıt vektörsüz` : "tüm kayıtlar vektörlenmiş"}
          </span>
        </div>

        {missing > 0 && (
          <Button onClick={runBackfill} disabled={!!backfilling}>
            {backfilling
              ? `${backfilling.phase}: ${backfilling.kb + backfilling.tickets}`
              : "Eksik vektörleri tamamla"}
          </Button>
        )}
      </Section>

      <Section title="Yapay zeka servisi" description="Hangi katman aktif">
        <p style={{ margin: 0, fontSize: T.sm, color: C.inkSoft, lineHeight: 1.65, maxWidth: "68ch" }}>
          Servise erişilemediğinde sistem durmuyor; anahtar kelime tabanlı yerel mantığa
          düşüyor. Bu kontrol, hangi katmanın aktif olduğunu görmek için.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={check} disabled={checking}>
            {checking ? "Kontrol ediliyor" : "Servisi kontrol et"}
          </Button>
          {ai && (
            <span style={{ fontSize: T.sm, color: ai.ok ? C.ok : C.danger }}>
              {ai.ok
                ? `Çalışıyor · ${ai.ms} ms · ${ai.dim} boyutlu vektör`
                : "Erişilemiyor · yerel katman devrede"}
            </span>
          )}
        </div>
      </Section>

      <Section title="Kayıt sayıları" description="Sistemdeki toplam veri" last>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "18px 24px" }}>
          {[
            [health.groups, "destek grubu"],
            [health.ticketTotal, "kayıt"],
            [health.requirements, "gereksinim"],
            [health.tests, "test senaryosu"],
            [health.executions, "test yürütmesi"],
          ].map(([n, k]) => (
            <div key={k}>
              <div style={{ fontSize: T.lg, fontWeight: 500, letterSpacing: "-0.025em", lineHeight: 1 }}>
                {n}
              </div>
              <div style={{ fontSize: T.xs, color: C.inkFaint, marginTop: 6 }}>{k}</div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

/* ---------- Raporlar ---------- */

// Tarayıcının kendi PDF çıktısı kullanılıyor: kütüphane gerekmiyor,
// ekranda görülen doküman birebir kağıda geçiyor
function ReportsTab({ C, user }) {
  const notify = useToast();
  const [period, setPeriod] = useState("month");
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    const result = await buildReport(period);
    setReport(result);
    setBusy(false);
    notify(`${result.period.label} rapor hazırlandı`);
  }

  return (
    <>
      <div className="no-print">
        <Section title="Dönem raporu" description="Yönetime sunulacak doküman">
          <p style={{ margin: 0, fontSize: T.sm, color: C.inkSoft, lineHeight: 1.65, maxWidth: "68ch" }}>
            Seçilen dönemin verileri önceki eşit uzunluktaki dönemle karşılaştırılır. Yönetici
            özeti yapay zeka tarafından yazılır ama rapordaki her sayı doğrudan veritabanından
            gelir; model yalnızca yorumlar.
          </p>

          <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap", alignItems: "center" }}>
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                style={{
                  fontFamily: F.body,
                  fontSize: T.sm,
                  fontWeight: period === p.id ? 500 : 400,
                  padding: "8px 14px",
                  borderRadius: 7,
                  border: `1px solid ${period === p.id ? C.brand : C.lineStrong}`,
                  background: period === p.id ? C.brandSoft : "transparent",
                  color: period === p.id ? C.brand : C.inkSoft,
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}

            <span style={{ width: 12 }} />

            <Button onClick={generate} disabled={busy}>
              {busy ? "Rapor hazırlanıyor" : "Rapor oluştur"}
            </Button>

            {report && (
              <Button variant="secondary" onClick={() => window.print()}>
                Yazdır / PDF olarak kaydet
              </Button>
            )}
          </div>

          {report && (
            <p style={{ margin: "14px 0 0", fontSize: T.xs, color: C.inkFaint }}>
              Yazdırma penceresinde hedef olarak "PDF olarak kaydet" seçin.
            </p>
          )}
        </Section>
      </div>

      {busy && !report && <Skeleton lines={10} style={{ marginTop: 24 }} />}

      {report && (
        <div className="report-area" style={{ marginTop: 32 }}>
          <ReportDocument report={report} author={user.name} />
        </div>
      )}
    </>
  );
}
