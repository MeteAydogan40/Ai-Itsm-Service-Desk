// ============================================================
// EDGE FUNCTION: analyze
// ============================================================
// React uygulaması LLM'i doğrudan çağırmaz — bu fonksiyonu çağırır.
// Bu fonksiyon Supabase'in sunucusunda çalışır ve API anahtarını
// orada saklar. Böylece anahtar tarayıcıya hiç inmez.
//
//   Tarayıcı  →  bu fonksiyon  →  Gemini API
//                   ↑ anahtar burada, güvende
//
// DAYANIKLILIK KATMANLARI:
//   1. Yeniden deneme  — geçici hatalarda (429/503) bekleyip tekrar dener
//   2. Yedek modeller  — ana model meşgulse sıradaki modele geçer
//   3. Yerel yedek     — hepsi başarısızsa React tarafı kendi mantığına düşer
//
// GÖREVLER:
//   classify   — sorunu sınıflandır
//   suggest    — çözüm adımları üret (RAG bağlamıyla)
//   checklist  — teknisyen kontrol listesi
//   embed      — metni vektöre çevir (semantik arama için)
//   compare    — iki çağrının neden benzer olduğunu açıkla
// ============================================================

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

// Üretim modelleri, sırayla denenir
const MODELS = ["gemini-3.6-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"];

// Embedding modelleri. text-embedding-004 Ocak 2026'da kapatıldı;
// güncel GA modeller bunlar.
const EMBED_MODELS = ["gemini-embedding-001", "gemini-embedding-2"];

// Vektör boyutu. Varsayılan 3072 ama "Matryoshka" tekniği vektörü
// kısaltmaya izin veriyor. 768'de kalite kaybı çok düşük, depolama
// ve arama dört kat hafif.
const EMBED_DIM = 768;

// Geçici sayılan hata kodları — bunlarda tekrar denemek mantıklı.
// 429 = çok fazla istek, 503 = sunucu yoğun, 5xx = geçici sunucu hatası
const RETRYABLE = [429, 500, 502, 503, 504];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------
// Tek bir modele tek bir üretim isteği
// ------------------------------------------------------------
async function callModel(
  model: string,
  systemPrompt: string,
  userText: string,
  schema: unknown,
) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.4, // düşük = tutarlı, yüksek = yaratıcı
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    const err = new Error(`${model} → ${res.status}: ${detail.slice(0, 200)}`);
    (err as Error & { status: number }).status = res.status;
    throw err;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`${model} boş cevap döndü`);
  return JSON.parse(text);
}

// ------------------------------------------------------------
// DAYANIKLI ÜRETİM ÇAĞRISI
// Her model için 2 deneme (arada artan bekleme). Kalıcı hatada
// beklemeden sonraki modele geçer.
// ------------------------------------------------------------
async function askGemini(systemPrompt: string, userText: string, schema: unknown) {
  const attempts: string[] = [];

  for (const model of MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await callModel(model, systemPrompt, userText, schema);
        return { ...result, _model: model };
      } catch (err) {
        const e = err as Error & { status?: number };
        attempts.push(e.message);
        const isRetryable = e.status ? RETRYABLE.includes(e.status) : true;
        if (!isRetryable) break;
        if (attempt < 2) await sleep(900 * attempt); // üstel geri çekilme
      }
    }
    await sleep(250);
  }

  throw new Error(`Tüm modeller başarısız oldu. Denemeler: ${attempts.join(" | ")}`);
}

// ------------------------------------------------------------
// EMBEDDING ÜRETİMİ
// Metni sayı vektörüne çeviriyor. Anlamca yakın metinler
// vektör uzayında da yakın oluyor.
//
// taskType önemli: aynı metin, "aranan sorgu" olarak mı yoksa
// "aranacak belge" olarak mı gömüldüğüne göre biraz farklı
// vektörleniyor. Bu, arama isabetini ölçülebilir biçimde artırıyor.
// ------------------------------------------------------------
async function embed(payload: { text: string; kind?: string }) {
  const taskType = payload.kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT";
  const attempts: string[] = [];

  for (const model of EMBED_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const url =
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${GEMINI_KEY}`;

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: `models/${model}`,
            content: { parts: [{ text: payload.text.slice(0, 8000) }] },
            taskType,
            outputDimensionality: EMBED_DIM,
          }),
        });

        if (!res.ok) {
          const detail = await res.text();
          const err = new Error(`${model} → ${res.status}: ${detail.slice(0, 200)}`);
          (err as Error & { status: number }).status = res.status;
          throw err;
        }

        const data = await res.json();
        const values = data?.embedding?.values;
        if (!Array.isArray(values)) throw new Error(`${model} geçersiz vektör döndü`);

        return { embedding: values, dim: values.length, _model: model };
      } catch (err) {
        const e = err as Error & { status?: number };
        attempts.push(e.message);
        const isRetryable = e.status ? RETRYABLE.includes(e.status) : true;
        if (!isRetryable) break;
        if (attempt < 2) await sleep(700 * attempt);
      }
    }
  }

  throw new Error(`Embedding üretilemedi. Denemeler: ${attempts.join(" | ")}`);
}

// ------------------------------------------------------------
// GÖREV 1: Sorunu sınıflandır
// ------------------------------------------------------------
async function classify(payload: {
  text: string;
  categories: string[];
  supportGroups?: string[];
}) {
  const system =
    `Sen bir kurumsal BT destek masası asistanısın. Çalışanların yazdığı sorun ve talep bildirimlerini analiz ediyorsun. Bunlar hem klasik BT destek konuları (ağ, donanım, hesap) hem de kurumsal uygulama talepleri (SAP geliştirme, değişiklik, hata düzeltme) olabilir.

Kurallar:
- Kullanıcı yazım hatası yapmış, kısaltma kullanmış veya günlük dille yazmış olabilir. Niyeti anla, harfiyen okuma.
- type: sorun bildirimi ise "Olay", yeni bir şey isteniyorsa "Talep", mevcut bir şeyin değişmesi isteniyorsa "Değişiklik".
- category: verilen listeden seç. Hiçbiri uymuyorsa "Genel".
- subCategory: daha dar bir alt başlık. Örnek: kategori "SAP" ise alt kategori "MM - Satınalma".
- affectedSystem: etkilenen sistem veya uygulama adı. Belli değilse boş bırak.
- supportGroup: verilen destek grubu listesinden en uygun olanı seç.
- impact: kaç kişiyi/süreci etkiliyor. "Yüksek" = birden çok kişi veya kritik iş süreci durmuş, "Orta" = tek kişi ama işini engelliyor, "Düşük" = geçici çözümü var.
- priority: etki ve aciliyeti birlikte değerlendir.
- priorityReason: önceliği NEDEN o seviyeye koyduğunu tek cümlede açıkla. Metindeki hangi ipucuna dayandığını söyle. Bu gerekçe uzmana gösterilecek.
- frustrated: kullanıcı yorgun, sinirli veya uzun süredir uğraşıyorsa true.
- followUpQuestion: teşhisi daraltacak TEK bir soru. Bu soru, işin teknik detayını bilmeyen bir ofis çalışanına soruluyor — onun gözlemleyebileceği veya bilebileceği bir şey sor. Tablo yapısı, yetki tanımı, sunucu ayarı gibi teknik ekibin bileceği şeyleri sorma. Talep tipindeki kayıtlarda kapsam, öncelik veya iş ihtiyacına dair bir şey sor. Kısa, sade, jargonsuz. Kullanıcının zaten söylediğini tekrar sorma.
- Konu bilgi teknolojileriyle ilgili değilse (sağlık, kişisel, hukuki vb.) category olarak "Genel" seç ve followUpQuestion alanına kibarca bunun bir BT destek masası olduğunu, bu konuda yardımcı olamayacağını ve bilgisayar, uygulama veya erişimle ilgili bir sorunu varsa yazabileceğini söyleyen tek bir cümle yaz.
- summary: teknisyenin hızlıca okuyacağı tek cümlelik özet.
- Tüm çıktı Türkçe olacak.`;

  const schema = {
    type: "OBJECT",
    properties: {
      type: { type: "STRING", enum: ["Olay", "Talep", "Değişiklik"] },
      category: { type: "STRING" },
      subCategory: { type: "STRING" },
      affectedSystem: { type: "STRING" },
      supportGroup: { type: "STRING" },
      impact: { type: "STRING", enum: ["Yüksek", "Orta", "Düşük"] },
      priority: { type: "STRING", enum: ["Yüksek", "Orta", "Düşük"] },
      priorityReason: { type: "STRING" },
      frustrated: { type: "BOOLEAN" },
      followUpQuestion: { type: "STRING" },
      summary: { type: "STRING" },
    },
    required: [
      "type", "category", "subCategory", "affectedSystem", "supportGroup",
      "impact", "priority", "priorityReason", "frustrated",
      "followUpQuestion", "summary",
    ],
  };

  const user = `Kullanılabilir kategoriler: ${payload.categories.join(", ")}
Kullanılabilir destek grupları: ${(payload.supportGroups || ["1. Seviye Destek"]).join(", ")}

Çalışanın bildirimi:
"""
${payload.text}
"""`;

  return await askGemini(system, user, schema);
}

// ------------------------------------------------------------
// GÖREV 2: Çözüm adımları (RAG bağlamıyla)
// Artık bilgi bankasının tamamı değil, semantik olarak en yakın
// kayıtlar geliyor. Her kaydın kimliği de geliyor ki hangi adımın
// hangi kaynaktan türediğini işaretleyebilelim.
// ------------------------------------------------------------
async function suggest(payload: {
  text: string;
  followUpAnswer: string;
  category: string;
  context: Array<{ id: string; category: string; steps: string[]; similarity: number }>;
}) {
  const system =
    `Sen bir kurumsal BT destek masası asistanısın. Çalışana, çağrı açmadan önce kendi deneyebileceği çözüm adımları öneriyorsun.

Kurallar:
- 3 ila 5 adım üret. Kolaydan zora sırala.
- Her adım TEK bir eylem olsun. Birleşik adım yazma.
- Teknik bilgisi olmayan bir ofis çalışanının anlayacağı dille yaz.
- Yönetici hakkı, komut satırı veya kayıt defteri gerektiren adımlar önerme — bunlar teknisyenin işi.
- Sana kurumun bilgi bankasından alakalı kayıtlar verildi. Uygun olanları önce kullan, sonra kendi önerilerini ekle.
- sourceId: bir adım doğrudan bir bilgi bankası kaydından geliyorsa o kaydın id'sini yaz. Kendi ürettiğin adımlarda boş bırak. Bu alan kullanıcıya kaynak göstermek için kullanılacak, doğru doldur.
- Kullanıcının zaten denediğini söylediği şeyleri tekrar önerme.
- Her adım en fazla bir cümle. Türkçe yaz.`;

  const schema = {
    type: "OBJECT",
    properties: {
      steps: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            text: { type: "STRING" },
            sourceId: { type: "STRING" },
          },
          required: ["text", "sourceId"],
        },
      },
    },
    required: ["steps"],
  };

  const ctx = payload.context.length
    ? payload.context
        .map(
          (c) =>
            `[id: ${c.id} | kategori: ${c.category} | benzerlik: ${(c.similarity * 100).toFixed(0)}%]\n` +
            c.steps.map((s) => `  - ${s}`).join("\n"),
        )
        .join("\n\n")
    : "(alakalı kayıt bulunamadı)";

  const user = `Kategori: ${payload.category}

Çalışanın ilk bildirimi:
"""
${payload.text}
"""

Takip sorusuna verdiği cevap:
"""
${payload.followUpAnswer}
"""

Bilgi bankasından alakalı kayıtlar:
${ctx}`;

  return await askGemini(system, user, schema);
}

// ------------------------------------------------------------
// GÖREV 3: Kapanış kontrol listesi + bilgi bankası taslağı
//
// İki çıktı tek çağrıda üretiliyor: ikisi de aynı bağlamı
// (çağrı + çözüm notu) kullandığı için ayrı istek atmak
// gereksiz maliyet olurdu.
// ------------------------------------------------------------
async function checklist(payload: {
  category: string;
  title: string;
  description: string;
  resolutionNote: string;
}) {
  const system =
    `Sen bir kurumsal BT ekibinin kalite kontrol asistanısın. İki iş yapıyorsun: kapanış kontrol listesi hazırlamak ve çözümü bilgi bankasına uygun bir taslağa dönüştürmek.

KONTROL LİSTESİ kuralları:
- 3 ila 4 madde üret.
- Her madde soru cümlesi olsun ve "yapıldı mı?" mantığında bitsin.
- Maddeler bu çağrıya özgü olsun; her çağrıya uyan genel maddeler yazma.
- Sorunun tekrar etmesini önlemeye ve kullanıcıyı bilgilendirmeye odaklan.

BİLGİ BANKASI TASLAĞI kuralları:
- title: bu sorunu arayan birinin bulabileceği kısa bir başlık.
- problem: belirtiyi kullanıcının göreceği şekilde tarif et. Teknik teşhis değil, gözlenen durum.
- cause: kök neden. Çözüm notundan çıkarabildiğin kadarını yaz; belli değilse "Çözüm notunda kök neden belirtilmemiş" yaz, uydurma.
- solution: uygulanan çözüm, tekrar uygulanabilir adımlar halinde. Her adım tek bir eylem.
- verification: çözümün işe yaradığını doğrulamak için ne kontrol edilmeli.
- Çözüm notu boşsa veya anlamsızsa tüm alanları boş bırak ve usable=false yaz.
- usable: taslak bilgi bankasına eklenmeye değer mi? Tek seferlik, kuruma özgü olmayan veya tekrar etmeyecek bir durumsa false.

Tüm çıktı Türkçe olacak.`;

  const schema = {
    type: "OBJECT",
    properties: {
      items: { type: "ARRAY", items: { type: "STRING" } },
      knowledgeDraft: {
        type: "OBJECT",
        properties: {
          usable: { type: "BOOLEAN" },
          title: { type: "STRING" },
          problem: { type: "STRING" },
          cause: { type: "STRING" },
          solution: { type: "ARRAY", items: { type: "STRING" } },
          verification: { type: "STRING" },
        },
        required: ["usable", "title", "problem", "cause", "solution", "verification"],
      },
    },
    required: ["items", "knowledgeDraft"],
  };

  const user = `Kategori: ${payload.category}
Başlık: ${payload.title}
Açıklama: ${payload.description}
Teknisyenin çözüm notu: ${payload.resolutionNote || "(henüz yazılmadı)"}`;

  return await askGemini(system, user, schema);
}

// ------------------------------------------------------------
// GÖREV 8: Uzman özeti (FR-08)
//
// Teknisyen çağrıyı açtığında ham veriyi okumak zorunda kalmasın:
// muhtemel nedenler ve önerilen ilk aksiyonlar hazır gelsin.
//
// Model burada teşhis koymuyor, ihtimal sıralıyor. Bu ayrım
// önemli: kesin konuşan bir özet, teknisyeni yanlış yöne
// saptırabilir.
// ------------------------------------------------------------
async function triage(payload: {
  title: string;
  description: string;
  category: string;
  subCategory?: string;
  affectedSystem?: string;
  triedSteps?: string[];
  conversation?: Array<{ role: string; content: string }>;
  similar?: Array<{ title: string; resolution: string }>;
}) {
  const system =
    `Sen bir kıdemli BT destek uzmanısın. Bir çağrıyı devralan teknisyene hızlı bir durum değerlendirmesi hazırlıyorsun.

Kurallar:
- summary: çağrının özü, iki cümleyi geçmesin. Başlıkta yazanı tekrar etme, bağlam kat.
- probableCauses: 2 ila 4 muhtemel neden. En olasıdan başla. Her biri için likelihood ("Yüksek", "Orta", "Düşük") ver.
- KESİN KONUŞMA. Teşhis koymuyorsun, ihtimal sıralıyorsun. "Kesinlikle şudur" deme.
- Kullanıcının denediği adımlar veriliyse, onların elediği ihtimalleri tekrar yazma.
- Benzer geçmiş çağrılar veriliyse, oradaki çözümler bir nedene işaret ediyorsa bunu belirt.
- nextActions: teknisyenin ilk yapması gereken 2 ila 4 somut kontrol. Sırayla, en hızlı elenecek olandan başla.
- Her aksiyon tek bir eylem olsun ve ne aradığını söylesin. "Logları kontrol et" değil, "Olay günlüğünde son 24 saatte kimlik doğrulama hatası var mı bak".
- escalationHint: bu çağrı başka bir ekibe devredilmeli mi? Gerekmiyorsa boş bırak.
- Tüm çıktı Türkçe olacak.`;

  const schema = {
    type: "OBJECT",
    properties: {
      summary: { type: "STRING" },
      probableCauses: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            cause: { type: "STRING" },
            likelihood: { type: "STRING", enum: ["Yüksek", "Orta", "Düşük"] },
            basis: { type: "STRING" },
          },
          required: ["cause", "likelihood", "basis"],
        },
      },
      nextActions: { type: "ARRAY", items: { type: "STRING" } },
      escalationHint: { type: "STRING" },
    },
    required: ["summary", "probableCauses", "nextActions", "escalationHint"],
  };

  const parts = [
    `Başlık: ${payload.title}`,
    `Açıklama: ${payload.description}`,
    `Kategori: ${[payload.category, payload.subCategory].filter(Boolean).join(" > ")}`,
    payload.affectedSystem && `Etkilenen sistem: ${payload.affectedSystem}`,
    payload.triedSteps?.length &&
      `Kullanıcının denedikleri:\n${payload.triedSteps.map((s) => `- ${s}`).join("\n")}`,
    payload.conversation?.length &&
      `Asistanla konuşma:\n${payload.conversation
        .map((c) => `${c.role === "user" ? "Çalışan" : "Asistan"}: ${c.content}`)
        .join("\n")}`,
    payload.similar?.length &&
      `Benzer geçmiş çağrılar:\n${payload.similar
        .map((s) => `- ${s.title}\n  Çözüm: ${s.resolution || "(not yok)"}`)
        .join("\n")}`,
  ].filter(Boolean);

  return await askGemini(system, parts.join("\n\n"), schema);
}

// ------------------------------------------------------------
// GÖREV 4: Benzerlik gerekçesi (FR-07)
// Vektör araması "bunlar benziyor" diyor ama NEDEN benzediğini
// söylemiyor. Kosinüs skoru bir sayı, uzmana anlam ifade etmiyor.
// Bu görev, bulunan benzer çağrıların ortak noktasını açıklıyor.
// ------------------------------------------------------------
async function compare(payload: {
  current: { title: string; description: string };
  similar: Array<{ ticketNo: string; title: string; resolution: string; similarity: number }>;
}) {
  const system =
    `Sen bir BT destek uzmanına yardım eden bir asistansın. Elinde yeni bir çağrı ve ona anlamca benzeyen geçmiş çağrılar var.

Kurallar:
- Her geçmiş çağrı için, yeni çağrıyla NEDEN benzediğini tek cümlede açıkla. Ortak belirti, ortak sistem veya ortak kök neden neyse onu söyle.
- Benzerlik yüzdesini tekrar etme, o zaten gösteriliyor.
- useful: geçmiş çağrının çözümü bu yeni çağrıda işe yarayabilir mi? Sadece gerçekten uygulanabilirse true yaz.
- Yüzeysel benzerlikleri (ikisi de bilgisayarla ilgili gibi) gerekçe olarak yazma, işe yaramaz.
- Türkçe yaz.`;

  const schema = {
    type: "OBJECT",
    properties: {
      comparisons: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            ticketNo: { type: "STRING" },
            reason: { type: "STRING" },
            useful: { type: "BOOLEAN" },
          },
          required: ["ticketNo", "reason", "useful"],
        },
      },
    },
    required: ["comparisons"],
  };

  const user = `Yeni çağrı:
Başlık: ${payload.current.title}
Açıklama: ${payload.current.description}

Benzer geçmiş çağrılar:
${payload.similar
  .map(
    (s) =>
      `[${s.ticketNo}] ${s.title}\n  Çözüm: ${s.resolution || "(çözüm notu yok)"}`,
  )
  .join("\n\n")}`;

  return await askGemini(system, user, schema);
}

// ------------------------------------------------------------
// GÖREV 5: Dokümandan gereksinim çıkarımı (FR-12)
//
// Serbest metinle yazılmış bir talep dokümanını, takip
// edilebilir gereksinim birimlerine ayırıyor.
//
// Kritik tasarım kararı: modelden sourceQuote istiyoruz — her
// gereksinimin dokümandaki hangi cümleden türediği. Bu olmadan
// "bunu nereden çıkardın" sorusunun cevabı yok. Yapay zeka
// çıktısında izlenebilirlik tam olarak bu demek.
//
// İkinci karar: ambiguous alanı. Model eksik bilgiyi kendi
// kafasına göre tamamlamasın; belirsizse işaretlesin, insan
// karar versin.
// ------------------------------------------------------------
async function extractRequirements(payload: {
  documentText: string;
  ticketTitle?: string;
  ticketDescription?: string;
}) {
  const system =
    `Sen bir iş analistisin. Kurumsal bir talep dokümanını okuyup, geliştirme ekibinin takip edebileceği gereksinim birimlerine ayırıyorsun.

Kurallar:
- Her gereksinim TEK bir doğrulanabilir davranış anlatsın. "Ekran açılsın ve rapor alınsın" iki ayrı gereksinimdir.
- code: REQ-01'den başlayarak sırayla numaralandır.
- title: kısa ve eylem odaklı. En fazla bir satır.
- description: gereksinimin ne olduğunu net anlat. Dokümanda yazmayan bir şey ekleme.
- reqType: "Fonksiyonel" (sistemin ne yapacağı), "Fonksiyonel Olmayan" (performans, kullanılabilirlik), "Yetki" (kim erişebilir), "Veri" (hangi alan nasıl saklanacak), "Entegrasyon" (başka sistemle konuşma).
- priority: dokümandaki vurguya göre. "mutlaka", "zorunlu", "kritik" geçiyorsa Yüksek.
- sourceQuote: bu gereksinimi çıkardığın cümleyi dokümandan AYNEN al. Kendi cümleni yazma. Bu alan, çıkarımın doğrulanabilmesi için var.
- confidence: dokümandaki ifade net ve tek anlamlıysa "Yüksek"; yorum gerektiyse "Orta"; büyük ölçüde çıkarım yaptıysan "Düşük".
- ambiguous: doküman bu konuda eksik veya çelişkiliyse true yaz.
- ambiguityNote: ambiguous true ise, tam olarak neyin belirsiz olduğunu ve neyin sorulması gerektiğini yaz.
- ASLA dokümanda olmayan bir gereksinim uydurma. Eksikse ambiguous işaretle, tamamlama.
- openQuestions: dokümanın cevaplamadığı, geliştirmeye başlamadan önce netleşmesi gereken sorular. Yoksa boş dizi.
- 3 ila 12 gereksinim üret. Doküman kısaysa az sayıda üretmek normaldir.
- Tüm çıktı Türkçe olacak.`;

  const schema = {
    type: "OBJECT",
    properties: {
      documentSummary: { type: "STRING" },
      requirements: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            code: { type: "STRING" },
            title: { type: "STRING" },
            description: { type: "STRING" },
            reqType: {
              type: "STRING",
              enum: ["Fonksiyonel", "Fonksiyonel Olmayan", "Yetki", "Veri", "Entegrasyon"],
            },
            priority: { type: "STRING", enum: ["Yüksek", "Orta", "Düşük"] },
            sourceQuote: { type: "STRING" },
            confidence: { type: "STRING", enum: ["Yüksek", "Orta", "Düşük"] },
            ambiguous: { type: "BOOLEAN" },
            ambiguityNote: { type: "STRING" },
          },
          required: [
            "code", "title", "description", "reqType", "priority",
            "sourceQuote", "confidence", "ambiguous", "ambiguityNote",
          ],
        },
      },
      openQuestions: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["documentSummary", "requirements", "openQuestions"],
  };

  const user = `${payload.ticketTitle ? `Çağrı başlığı: ${payload.ticketTitle}\n` : ""}${
    payload.ticketDescription ? `Çağrı açıklaması: ${payload.ticketDescription}\n\n` : ""
  }Talep dokümanı:
"""
${payload.documentText.slice(0, 30000)}
"""`;

  return await askGemini(system, user, schema);
}

// ------------------------------------------------------------
// GÖREV 6: Görsel analizi
//
// Kullanıcılar hata ekranının fotoğrafını gönderiyor. Model
// görseli okuyup hata mesajını metne çevirebiliyor — böylece
// ekran görüntüsü de aranabilir ve sınıflandırılabilir bir
// içeriğe dönüşüyor.
//
// Dokümanda istenmiyor; gerçek kullanımda en çok işe yarayan
// şeylerden biri olduğu için ekledik.
// ------------------------------------------------------------
async function analyzeImage(payload: { base64: string; mimeType: string }) {
  const system =
    `Sen bir BT destek asistanısın. Kullanıcının gönderdiği ekran görüntüsünü inceliyorsun.

Kurallar:
- visibleText: ekranda okunabilen hata mesajlarını, kod numaralarını ve uyarıları AYNEN yaz. Okunamıyorsa boş bırak.
- description: ekranda ne görüldüğünü bir iki cümleyle anlat.
- errorCode: belirgin bir hata kodu varsa yaz, yoksa boş bırak.
- application: hangi uygulama veya ekran olduğu anlaşılıyorsa yaz.
- Gördüğünden emin olmadığın şeyi yazma, tahmin yürütme.
- Türkçe yaz, ama ekrandaki metni çevirmeden olduğu gibi aktar.`;

  const schema = {
    type: "OBJECT",
    properties: {
      visibleText: { type: "STRING" },
      description: { type: "STRING" },
      errorCode: { type: "STRING" },
      application: { type: "STRING" },
    },
    required: ["visibleText", "description", "errorCode", "application"],
  };

  const attempts: string[] = [];

  for (const model of MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const url =
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [
              {
                role: "user",
                parts: [
                  { inlineData: { mimeType: payload.mimeType, data: payload.base64 } },
                  { text: "Bu ekran görüntüsünü incele." },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: "application/json",
              responseSchema: schema,
            },
          }),
        });

        if (!res.ok) {
          const detail = await res.text();
          const err = new Error(`${model} → ${res.status}: ${detail.slice(0, 200)}`);
          (err as Error & { status: number }).status = res.status;
          throw err;
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error(`${model} boş cevap döndü`);
        return { ...JSON.parse(text), _model: model };
      } catch (err) {
        const e = err as Error & { status?: number };
        attempts.push(e.message);
        const isRetryable = e.status ? RETRYABLE.includes(e.status) : true;
        if (!isRetryable) break;
        if (attempt < 2) await sleep(900 * attempt);
      }
    }
  }

  throw new Error(`Görsel analiz edilemedi. Denemeler: ${attempts.join(" | ")}`);
}

// ------------------------------------------------------------
// GÖREV 7: Gereksinimlerden test senaryosu üretimi (FR-13)
//
// Her onaylanmış gereksinim için doğrulama senaryoları üretiyor.
//
// Tasarım kararları:
//   - requirementCode alanı zorunlu: her test hangi gereksinimden
//     türediğini taşımalı, yoksa izlenebilirlik yok (FR-14).
//   - isCritical: modelin her testi kritik işaretleme eğilimi var,
//     bu yüzden talimatta sınır koyduk. Kritik testler kapatmayı
//     engelleyecek; hepsi kritikse kural anlamsızlaşır.
//   - steps: ayrı alan. "Şunu yap sonra bunu yap" tek cümlede
//     yazılırsa test tekrarlanabilir olmuyor.
// ------------------------------------------------------------
async function generateTests(payload: {
  requirements: Array<{ code: string; title: string; description: string; reqType: string; priority: string }>;
  ticketTitle?: string;
  affectedSystem?: string;
}) {
  const system =
    `Sen bir yazılım test uzmanısın. Sana verilen gereksinimler için doğrulanabilir test senaryoları yazıyorsun.

Kurallar:
- Her gereksinim için 1 ila 3 test üret. Basit gereksinimlerde 1 test yeterlidir, zorunlu değilse fazlasını üretme.
- requirementCode: testin doğruladığı gereksinimin kodunu AYNEN yaz. Bu alan izlenebilirlik için zorunludur, uydurma.
- code: TEST-01'den başlayarak sırayla numaralandır.
- testType seçimi:
  * "Pozitif" — beklenen normal davranış doğru çalışıyor mu
  * "Negatif" — hatalı veya eksik girdide sistem doğru tepki veriyor mu
  * "Sınır Değer" — eşik değerin tam üstünde, tam altında ve tam üstünde davranış
  * "Yetki" — yetkisiz kullanıcı erişemiyor, yetkili erişebiliyor mu
  * "Regresyon" — bu değişiklik mevcut çalışan bir işlevi bozdu mu
- Gereksinimde bir eşik, limit veya sayı geçiyorsa mutlaka bir "Sınır Değer" testi üret.
- Gereksinim yetkiyle ilgiliyse mutlaka bir "Yetki" testi üret.
- preconditions: test başlamadan önce hazır olması gerekenler. Yoksa boş bırak.
- steps: numaralandırma yazma, her adım ayrı bir dizi elemanı olsun. Her adım tek bir eylem.
- expectedResult: tek ve net bir sonuç. "Çalışmalı" gibi belirsiz ifade kullanma; ne görüleceğini yaz.
- isCritical: SADECE şu durumlarda true yaz — veri kaybına yol açabilecek, yetkisiz erişime izin verebilecek, ya da gereksinimin ana amacını doğrudan doğrulayan test. Testlerin en fazla yarısı kritik olmalı; hepsini kritik işaretleme.
- criticalReason: isCritical true ise neden kritik olduğunu kısaca yaz. Değilse boş bırak.
- Türkçe yaz.`;

  const schema = {
    type: "OBJECT",
    properties: {
      tests: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            code: { type: "STRING" },
            requirementCode: { type: "STRING" },
            title: { type: "STRING" },
            testType: {
              type: "STRING",
              enum: ["Pozitif", "Negatif", "Sınır Değer", "Yetki", "Regresyon"],
            },
            preconditions: { type: "STRING" },
            steps: { type: "ARRAY", items: { type: "STRING" } },
            expectedResult: { type: "STRING" },
            isCritical: { type: "BOOLEAN" },
            criticalReason: { type: "STRING" },
          },
          required: [
            "code", "requirementCode", "title", "testType",
            "preconditions", "steps", "expectedResult",
            "isCritical", "criticalReason",
          ],
        },
      },
      coverageNote: { type: "STRING" },
    },
    required: ["tests", "coverageNote"],
  };

  const reqList = payload.requirements
    .map(
      (r) =>
        `${r.code} [${r.reqType}, öncelik ${r.priority}]\nBaşlık: ${r.title}\nAçıklama: ${r.description}`,
    )
    .join("\n\n");

  const user = `${payload.ticketTitle ? `Talep: ${payload.ticketTitle}\n` : ""}${
    payload.affectedSystem ? `Etkilenen sistem: ${payload.affectedSystem}\n` : ""
  }
Doğrulanacak gereksinimler:

${reqList}`;

  return await askGemini(system, user, schema);
}

// ------------------------------------------------------------
// GÖREV 9: Dönem raporu yönetici özeti
//
// Sayılar istemcide hesaplanıp veriliyor; model yalnızca yorumluyor.
// Modele sayı ürettirmiyoruz — rapordaki her rakam veritabanından.
// ------------------------------------------------------------
async function report(payload: { period: string; current: unknown; previous: unknown }) {
  const system =
    `Sen bir kurumsal BT hizmet yönetimi analistisin. Sana bir dönemin ölçülmüş verileri ve önceki dönemin verileri veriliyor. Yöneticiye sunulacak bir rapor için değerlendirme yazıyorsun.

Kurallar:
- summary: 2 ila 3 paragraf. Dönemin genel tablosu, önceki döneme göre ne değişti, dikkat çeken ne var. Düz metin, madde işareti yok.
- Yalnızca verilen sayıları kullan. Yeni sayı üretme, tahmin yürütme, verilmeyen bir oranı hesaplıyormuş gibi yazma.
- Bir değişimden bahsederken yönünü ve büyüklüğünü söyle ("12'den 18'e çıktı").
- Veri azsa (örneğin 5'ten az kayıt) bunu belirt ve kesin yorum yapma.
- highlights: olumlu gelişmeler, 1 ila 3 madde, her biri tek cümle.
- concerns: dikkat gerektiren konular, 0 ila 3 madde, her biri tek cümle. Sorun yoksa boş bırak.
- recommendations: somut öneriler, 1 ila 3 madde. "İzlemeye devam edin" gibi boş öneriler yazma; bir kayda, kategoriye veya sürece işaret et.
- Resmi ama okunaklı Türkçe.`;

  const schema = {
    type: "OBJECT",
    properties: {
      summary: { type: "STRING" },
      highlights: { type: "ARRAY", items: { type: "STRING" } },
      concerns: { type: "ARRAY", items: { type: "STRING" } },
      recommendations: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["summary", "highlights", "concerns", "recommendations"],
  };

  const user = `Dönem: ${payload.period}

Bu dönem:
${JSON.stringify(payload.current, null, 2)}

Önceki dönem:
${JSON.stringify(payload.previous, null, 2)}`;

  return await askGemini(system, user, schema);
}

// ------------------------------------------------------------
// GİRİŞ NOKTASI
// ------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    if (!GEMINI_KEY) {
      throw new Error("GEMINI_API_KEY tanımlı değil. Supabase secrets'a ekleyin.");
    }

    const body = await req.json();
    const { task, ...payload } = body;

    let result;
    if (task === "classify") result = await classify(payload);
    else if (task === "suggest") result = await suggest(payload);
    else if (task === "checklist") result = await checklist(payload);
    else if (task === "embed") result = await embed(payload);
    else if (task === "compare") result = await compare(payload);
    else if (task === "requirements") result = await extractRequirements(payload);
    else if (task === "image") result = await analyzeImage(payload);
    else if (task === "tests") result = await generateTests(payload);
    else if (task === "triage") result = await triage(payload);
    else if (task === "report") result = await report(payload);
    else throw new Error(`Bilinmeyen görev: ${task}`);

    return new Response(JSON.stringify(result), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    // Hata olsa bile 200 dönüyoruz ve içeriğe error koyuyoruz —
    // böylece React tarafı kolayca yakalayıp yerel mantığa geçebiliyor.
    return new Response(
      JSON.stringify({ error: String(err instanceof Error ? err.message : err) }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
