import { supabase } from "./supabase";
import { embed, retrieveKnowledge, retrieveSimilarTickets, checkRecurring } from "./embeddings";

async function callLLM(task, payload) {
  const { data, error } = await supabase.functions.invoke("analyze", {
    body: { task, ...payload },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

/* ---------- Analysis ---------- */

/**
 * Sorunu sınıflandırır ve tekrarlayan problem kontrolü yapar.
 * Dönen queryEmbedding sonraki adımlarda yeniden kullanılır —
 * her aşamada yeni vektör üretmek gereksiz maliyet.
 */
export async function analyzeProblem(text) {
  const [queryEmbedding, categories, supportGroups] = await Promise.all([
    embed(text, "query"),
    loadCategories(),
    loadSupportGroups(),
  ]);

  let result;
  try {
    result = { ...(await callLLM("classify", { text, categories, supportGroups })), usedLLM: true };
  } catch (err) {
    console.warn("LLM sınıflandıramadı, yerel mantığa geçiliyor:", err.message);
    result = { ...(await localClassify(text)), usedLLM: false };
  }

  return { ...result, queryEmbedding, recurring: await checkRecurring(queryEmbedding) };
}

async function loadCategories() {
  const { data } = await supabase.from("knowledge_base").select("category");
  return [...new Set((data || []).map((k) => k.category))];
}

async function loadSupportGroups() {
  const { data } = await supabase.from("support_groups").select("name");
  return (data || []).map((g) => g.name);
}

/* ---------- Suggestions (RAG) ---------- */

/**
 * Önce semantik arama ile alakalı kayıtları getirir, sonra
 * bunları bağlam olarak modele verir. Her adım kaynağını taşır.
 */
export async function suggestSteps({ text, followUpAnswer, category, queryEmbedding }) {
  const sources = await retrieveKnowledge(queryEmbedding, 4);

  try {
    const result = await callLLM("suggest", {
      text,
      followUpAnswer,
      category,
      context: sources.map(({ id, category, steps, similarity }) => ({
        id,
        category,
        steps: steps || [],
        similarity,
      })),
    });

    if (!result?.steps?.length) throw new Error("Boş adım listesi");

    return {
      steps: result.steps.map((s) => ({ text: s.text, sourceId: s.sourceId || null })),
      sources,
      usedLLM: true,
    };
  } catch (err) {
    console.warn("LLM adım üretemedi, bilgi bankası doğrudan kullanılıyor:", err.message);

    const fallback = sources.length
      ? sources
          .flatMap((s) => (s.steps || []).map((text) => ({ text, sourceId: s.id })))
          .slice(0, 4)
      : await localSteps(category);

    return { steps: fallback, sources, usedLLM: false };
  }
}

/* ---------- Similar tickets ---------- */

/**
 * Vektör araması benzerliği bulur ama nedenini söylemez.
 * Kosinüs skoru uzmana tek başına anlam ifade etmediği için
 * gerekçeyi ayrıca modele yazdırıyoruz.
 */
export async function findSimilarTickets(ticket) {
  const vector =
    ticket.embedding ||
    (await embed([ticket.title, ticket.description].filter(Boolean).join("\n"), "query"));

  if (!vector) return { items: [], usedLLM: false };

  const similar = await retrieveSimilarTickets(vector, ticket.id, 4);
  if (!similar.length) return { items: [], usedLLM: false };

  try {
    const result = await callLLM("compare", {
      current: { title: ticket.title, description: ticket.description || "" },
      similar: similar.map((s) => ({
        ticketNo: s.ticket_no,
        title: s.title,
        resolution: s.resolution_note || "",
        similarity: s.similarity,
      })),
    });

    const byTicketNo = Object.fromEntries(
      (result.comparisons || []).map((c) => [c.ticketNo, c]),
    );

    return {
      items: similar.map((s) => ({
        ...s,
        reason: byTicketNo[s.ticket_no]?.reason || null,
        useful: byTicketNo[s.ticket_no]?.useful ?? null,
      })),
      usedLLM: true,
    };
  } catch (err) {
    console.warn("Benzerlik gerekçesi üretilemedi:", err.message);
    // Gerekçe olmasa da benzerlik skorları kullanışlı
    return {
      items: similar.map((s) => ({ ...s, reason: null, useful: null })),
      usedLLM: false,
    };
  }
}

/* ---------- Closure checklist ---------- */

export async function buildChecklist(ticket, resolutionNote) {
  try {
    const result = await callLLM("checklist", {
      category: ticket.category,
      title: ticket.title,
      description: ticket.description,
      resolutionNote,
    });
    if (!result?.items?.length) throw new Error("Boş liste");
    return { items: result.items, draft: result.knowledgeDraft || null, usedLLM: true };
  } catch (err) {
    console.warn("LLM kontrol listesi üretemedi, sabit liste kullanılıyor:", err.message);
    return { items: localChecklist(ticket.category), draft: null, usedLLM: false };
  }
}

/**
 * Çağrıyı devralan teknisyene durum değerlendirmesi hazırlar:
 * muhtemel nedenler ve önerilen ilk kontroller.
 *
 * Model teşhis koymuyor, ihtimal sıralıyor — kesin konuşan bir
 * özet teknisyeni yanlış yöne saptırabilir.
 */
export async function buildTriage({ ticket, conversation, similar }) {
  try {
    const result = await callLLM("triage", {
      title: ticket.title,
      description: ticket.description,
      category: ticket.category,
      subCategory: ticket.sub_category,
      affectedSystem: ticket.affected_system,
      triedSteps: (ticket.tried_steps || []).map((s) => (typeof s === "string" ? s : s.text)),
      conversation: (conversation || []).map((c) => ({ role: c.role, content: c.content })),
      similar: (similar || []).slice(0, 3).map((s) => ({
        title: s.title,
        resolution: s.resolution_note || "",
      })),
    });
    return { ...result, usedLLM: true };
  } catch (err) {
    console.warn("Uzman özeti üretilemedi:", err.message);
    return null;
  }
}

/* ---------- Local fallback ---------- */

const URGENT_WORDS = ["acil", "toplantı", "müşteri", "sunum", "teslim", "hemen", "kritik", "durdu"];
const LOW_WORDS = ["ara sıra", "bazen", "acelesi yok", "önemli değil"];
const REQUEST_WORDS = ["talep", "istiyoruz", "eklensin", "geliştirme", "yeni özellik"];
const CHANGE_WORDS = ["değişiklik", "güncellensin", "revize", "düzenlensin"];
const FRUSTRATION_WORDS = ["saattir", "sinir", "bıktım", "yeter", "uğraşıyorum"];

const FOLLOW_UPS = {
  "Ağ Bağlantısı": "Bu sorun sadece sizde mi, ekipteki başkalarında da var mı?",
  "Donanım - Yazıcı": "Yazıcıda bir hata ışığı veya ekranında uyarı görüyor musunuz?",
  "Donanım - Bilgisayar": "Cihazı başka bir porta veya bilgisayara taktığınızda da aynı mı?",
  "Hesap Erişimi": "Şifrenizi yakın zamanda değiştirdiniz mi?",
  "Yazılım - Performans": "Bu ne zaman başladı — bugün mü, bir süredir mi?",
  "E-posta": "Sorun sadece Outlook'ta mı, web arayüzünde de aynı mı?",
  "Uygulama Erişimi": "Hata mesajı alıyor musunuz, alıyorsanız ne yazıyor?",
  Güvenlik: "Şüpheli bir bağlantıya tıkladınız mı veya bir dosya açtınız mı?",
  "Dosya ve Paylaşım": "Dosyaya daha önce erişebiliyor muydunuz?",
  "Telefon ve Toplantı": "Sorun her toplantıda mı, yoksa sadece belirli birinde mi?",
  SAP: "Hangi işlem kodunda ve hangi adımda karşılaşıyorsunuz?",
};

const CHECKLISTS = {
  "Ağ Bağlantısı": [
    "Bağlantı hızı testi yapıldı mı?",
    "Kullanıcının VPN profili güncel mi?",
    "Aynı ağdaki diğer cihazlar kontrol edildi mi?",
  ],
  "Donanım - Yazıcı": [
    "Yazıcı sürücüsü güncel mi?",
    "Test baskısı alındı mı?",
    "Kullanıcıya kısa bir kullanım notu iletildi mi?",
  ],
  "Hesap Erişimi": [
    "Şifre politikasına uygunluk kontrol edildi mi?",
    "İki adımlı doğrulama aktif mi?",
    "Hesap kilit geçmişi incelendi mi?",
  ],
};

const GENERIC_CHECKLIST = [
  "Kök neden not edildi mi?",
  "Kullanıcıya çözüm özeti iletildi mi?",
  "Tekrar ederse eskalasyon yolu belirlendi mi?",
];

const GENERIC_STEPS = [
  "Bilgisayarı yeniden başlatın",
  "Sorunun başka bir uygulamada da olup olmadığını kontrol edin",
  "Varsa bekleyen güncellemeleri kurun",
];

const includesAny = (text, words) => words.some((w) => text.includes(w));

// "ağrıyor" içinde "ağ" geçiyor; düz metin araması kısa anahtar kelimeleri
// başka kelimelerin içinde yakalıyordu. Kısa kelimeler tam eşleşmeli, uzunlar
// Türkçe ekleri tolere etmek için kelime başından eşleşebilir ("internete").
function matchesKeyword(tokens, lower, keyword) {
  if (keyword.includes(" ")) return lower.includes(keyword);
  if (keyword.length <= 3) return tokens.includes(keyword);
  return tokens.some((t) => t.startsWith(keyword));
}

async function localClassify(text) {
  const lower = text.toLocaleLowerCase("tr");
  const tokens = lower.split(/[^a-zçğıöşü0-9]+/).filter(Boolean);
  const { data: kb } = await supabase.from("knowledge_base").select("category, keywords");

  const best = (kb || []).reduce(
    (acc, entry) => {
      const score = (entry.keywords || []).filter((k) => matchesKeyword(tokens, lower, k)).length;
      return score > acc.score ? { score, category: entry.category } : acc;
    },
    { score: 0, category: "Genel" },
  );

  const priority = includesAny(lower, URGENT_WORDS)
    ? "Yüksek"
    : includesAny(lower, LOW_WORDS)
    ? "Düşük"
    : "Orta";

  const type = includesAny(lower, CHANGE_WORDS)
    ? "Değişiklik"
    : includesAny(lower, REQUEST_WORDS)
    ? "Talep"
    : "Olay";

  return {
    type,
    category: best.category,
    subCategory: "",
    affectedSystem: "",
    supportGroup: "1. Seviye Destek",
    impact: priority,
    priority,
    priorityReason: "Metindeki anahtar kelimelere göre belirlendi (yapay zeka devre dışı).",
    frustrated: includesAny(lower, FRUSTRATION_WORDS),
    followUpQuestion:
      FOLLOW_UPS[best.category] ||
      "Bu ne zaman başladı ve o sırada olağandışı bir şey yaptınız mı?",
    summary: text.slice(0, 90),
  };
}

async function localSteps(category) {
  const { data } = await supabase
    .from("knowledge_base")
    .select("id, steps")
    .eq("category", category)
    .limit(1);

  const row = data?.[0];
  return row?.steps?.length
    ? row.steps.slice(0, 4).map((text) => ({ text, sourceId: row.id }))
    : GENERIC_STEPS.map((text) => ({ text, sourceId: null }));
}

function localChecklist(category) {
  return CHECKLISTS[category] || GENERIC_CHECKLIST;
}

/* ---------- Assistant voice ---------- */

// Aynı cümleyi her seferinde kurmak sistemi robot gibi gösteriyor
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const VOICE = {
  greeting: () =>
    pick([
      "Merhaba. Yaşadığınız sorunu veya talebinizi kendi cümlelerinizle anlatın — teknik terim kullanmanıza gerek yok.",
      "Merhaba. Ne olduğunu anlatın, birlikte bakalım. Çoğu sorun birkaç adımda çözülüyor.",
      "Merhaba. Konuyu yazın; önce hızlı birkaç şey deneyelim, çözülmezse teknik ekibe iletiyorum.",
    ]),

  acknowledge: (category, frustrated) =>
    frustrated
      ? pick([
          `Uğraştığınızı görüyorum. ${category} tarafında bir şey gibi duruyor, hızlıca bakalım.`,
          `Sinir bozucu olduğunu biliyorum. ${category} ile ilgili görünüyor, birkaç ihtimali eleyelim.`,
        ])
      : pick([
          `Anladım, bu ${category} tarafında bir şeye benziyor.`,
          `Tamam. ${category} ile ilgili bir konu gibi duruyor.`,
          `${category} kategorisine giriyor bu. Bir bakalım.`,
        ]),

  beforeSteps: () =>
    pick([
      "Teşekkürler. Şunu bir dener misiniz:",
      "Peki, o zaman şuradan başlayalım:",
      "Anlaşıldı. İlk olarak şunu deneyelim:",
    ]),

  nextStep: () =>
    pick([
      "Olsun, sıradakine geçelim:",
      "Tamam, o zaman şunu deneyin:",
      "Peki. Bir de bunu deneyelim:",
    ]),

  solved: () =>
    pick([
      "Sevindim, çağrı açmanıza gerek kalmadı. İyi çalışmalar!",
      "Harika. Çağrı oluşturmuyorum o zaman — tekrar ederse buradayım.",
      "Süper. Sorun tekrarlarsa yine yazın, iyi çalışmalar.",
    ]),

  escalate: () =>
    pick([
      "Denediklerimiz işe yaramadı. Bunu teknik ekibe iletiyorum — denediğiniz adımları da çağrıya ekledim ki baştan tekrar sormasınlar.",
      "Bu benim çözebileceklerimin dışında kalmış. Teknik ekibe aktardım; ne denediğinizi de yazdım, zaman kaybetmezsiniz.",
    ]),
};

export function generateTicketNo() {
  const year = new Date().getFullYear();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `ITSM-${year}-${random}`;
}
