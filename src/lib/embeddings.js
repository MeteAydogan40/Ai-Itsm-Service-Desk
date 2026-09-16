import { supabase } from "./supabase";

const RATE_LIMIT_DELAY = 400;

/**
 * Metni 768 boyutlu bir vektöre çevirir.
 *
 * kind="query" ve kind="document" aynı metni farklı vektörler —
 * Gemini bunu bilerek ayırıyor ve arama isabetini artırıyor.
 *
 * @returns {number[]|null} başarısızlıkta null; çağıran taraf
 *   semantik aramayı atlayıp devam eder
 */
export async function embed(text, kind = "document") {
  if (!text?.trim()) return null;

  try {
    const { data, error } = await supabase.functions.invoke("analyze", {
      body: { task: "embed", text: text.trim(), kind },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data.embedding || null;
  } catch (err) {
    console.warn("Embedding üretilemedi:", err.message);
    return null;
  }
}

async function rpc(fn, params, fallback = []) {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) {
    console.warn(`${fn} başarısız:`, error.message);
    return fallback;
  }
  return data ?? fallback;
}

// RAG'ın getirme adımı: bilgi bankasının tamamı yerine en yakın kayıtlar
export function retrieveKnowledge(queryEmbedding, count = 4) {
  if (!queryEmbedding) return Promise.resolve([]);
  return rpc("match_knowledge", {
    query_embedding: queryEmbedding,
    match_count: count,
    min_similarity: 0.35,
  });
}

export function retrieveSimilarTickets(queryEmbedding, excludeId = null, count = 4) {
  if (!queryEmbedding) return Promise.resolve([]);
  return rpc("match_tickets", {
    query_embedding: queryEmbedding,
    match_count: count,
    min_similarity: 0.5,
    exclude_id: excludeId,
  });
}

// Kısa sürede benzer çağrılar artıyorsa tekil bir sorun değil, toplu arıza olabilir
export async function checkRecurring(queryEmbedding, windowHours = 24) {
  if (!queryEmbedding) return null;

  const rows = await rpc("detect_recurring", {
    query_embedding: queryEmbedding,
    window_hours: windowHours,
    min_similarity: 0.62,
  });

  const row = rows[0];
  if (!row || Number(row.match_count) < 2) return null;

  return {
    count: Number(row.match_count),
    category: row.category,
    oldest: row.oldest,
    newest: row.newest,
  };
}

export async function bumpKnowledgeUsage(kbId, worked) {
  if (!kbId) return;
  // supabase.rpc() thenable döndürür, gerçek Promise değil —
  // üstüne .catch() zincirlenemiyor
  try {
    await supabase.rpc("bump_kb_usage", { kb_id: kbId, worked });
  } catch (err) {
    console.warn("Bilgi bankası sayacı güncellenemedi:", err.message);
  }
}

/**
 * Geçmiş çağrıların gerçek sürelerinden çözüm süresi tahmini.
 * Modelin tahmini değil, ölçülmüş veriden hesap.
 */
export async function estimateResolution({ embedding, category, excludeId }) {
  const rows = await rpc("estimate_resolution", {
    query_embedding: embedding || null,
    p_category: category || null,
    exclude_id: excludeId || null,
    min_similarity: 0.45,
    min_sample: 3,
  });

  const row = rows[0];
  if (!row || !Number(row.sample_size)) return null;

  return {
    basis: row.basis,
    sampleSize: Number(row.sample_size),
    avgMinutes: Number(row.avg_minutes),
    medianMinutes: Number(row.median_minutes),
    fastestMinutes: Number(row.fastest_minutes),
    slowestMinutes: Number(row.slowest_minutes),
  };
}

function ticketText(ticket) {
  return [ticket.title, ticket.description, ticket.category, ticket.sub_category]
    .filter(Boolean)
    .join("\n");
}

export async function embedTicket(ticket) {
  const vector = await embed(ticketText(ticket), "document");
  if (!vector) return null;
  await supabase.from("tickets").update({ embedding: vector }).eq("id", ticket.id);
  return vector;
}

/**
 * Vektörü olmayan kayıtları tamamlar. Semantik arama sonradan
 * eklendiği için mevcut kayıtlarda vektör yok.
 *
 * Sıralı ve aralıklı çalışır: ücretsiz planda dakikada 15 istek sınırı var.
 */
export async function backfillEmbeddings(onProgress) {
  const report = { kb: 0, tickets: 0, failed: 0 };

  const { data: kbRows } = await supabase
    .from("knowledge_base")
    .select("id, category, steps")
    .is("embedding", null);

  for (const row of kbRows || []) {
    const vector = await embed([row.category, ...(row.steps || [])].join("\n"), "document");
    if (vector) {
      await supabase.from("knowledge_base").update({ embedding: vector }).eq("id", row.id);
      report.kb++;
    } else {
      report.failed++;
    }
    onProgress?.({ ...report, phase: "Bilgi bankası" });
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY));
  }

  const { data: ticketRows } = await supabase
    .from("tickets")
    .select("id, title, description, category, sub_category")
    .is("embedding", null);

  for (const row of ticketRows || []) {
    const vector = await embed(ticketText(row), "document");
    if (vector) {
      await supabase.from("tickets").update({ embedding: vector }).eq("id", row.id);
      report.tickets++;
    } else {
      report.failed++;
    }
    onProgress?.({ ...report, phase: "Çağrılar" });
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY));
  }

  return report;
}

export async function countMissingEmbeddings() {
  const countMissing = (table) =>
    supabase.from(table).select("*", { count: "exact", head: true }).is("embedding", null);

  const [kb, tickets] = await Promise.all([
    countMissing("knowledge_base"),
    countMissing("tickets"),
  ]);

  return { kb: kb.count || 0, tickets: tickets.count || 0 };
}
