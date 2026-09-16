import { supabase } from "./supabase";
import { embed } from "./embeddings";

/* ---------- Knowledge base ---------- */

export async function loadKnowledge() {
  const { data } = await supabase
    .from("knowledge_base")
    .select("*")
    .order("category", { ascending: true });
  return data || [];
}

// İçerik değişince vektör de yenilenmeli; yoksa semantik arama
// eski metne göre eşleştirmeye devam eder
async function refreshEmbedding(id, category, steps) {
  const vector = await embed([category, ...(steps || [])].join("\n"), "document");
  if (vector) {
    await supabase.from("knowledge_base").update({ embedding: vector }).eq("id", id);
  }
}

export async function createKnowledge({ category, keywords, steps }) {
  const { data, error } = await supabase
    .from("knowledge_base")
    .insert({
      category: category.trim(),
      keywords: keywords || [],
      steps: steps || [],
      source: "admin",
    })
    .select()
    .single();

  if (error) return { error: error.message };
  await refreshEmbedding(data.id, data.category, data.steps);
  return { entry: data };
}

export async function updateKnowledge(id, patch) {
  const { data, error } = await supabase
    .from("knowledge_base")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };
  if (patch.category || patch.steps) {
    await refreshEmbedding(data.id, data.category, data.steps);
  }
  return { entry: data };
}

export async function deleteKnowledge(id) {
  const { error } = await supabase.from("knowledge_base").delete().eq("id", id);
  return error ? { error: error.message } : { ok: true };
}

/* ---------- Support groups ---------- */

export async function loadGroups() {
  const { data } = await supabase
    .from("support_groups")
    .select("*")
    .order("name", { ascending: true });
  return data || [];
}

export async function createGroup({ name, description }) {
  const { data, error } = await supabase
    .from("support_groups")
    .insert({ name: name.trim(), description: description?.trim() || null })
    .select()
    .single();
  return error ? { error: error.message } : { group: data };
}

export async function updateGroup(id, patch) {
  const { data, error } = await supabase
    .from("support_groups")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  return error ? { error: error.message } : { group: data };
}

export async function deleteGroup(id) {
  const { data: group } = await supabase
    .from("support_groups")
    .select("name")
    .eq("id", id)
    .single();

  // Silinen bir gruba bağlı kayıtlar sahipsiz kalır
  const { count } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("support_group", group?.name);

  if (count > 0) {
    return { error: `Bu gruba atanmış ${count} kayıt var. Önce onları başka bir gruba taşıyın.` };
  }

  const { error } = await supabase.from("support_groups").delete().eq("id", id);
  return error ? { error: error.message } : { ok: true };
}

/* ---------- System health ---------- */

export async function loadHealth() {
  const count = (table) => supabase.from(table).select("*", { count: "exact", head: true });
  const countMissing = (table) => count(table).is("embedding", null);

  const [kbTotal, kbMissing, ticketTotal, ticketMissing, groups, requirements, tests, executions] =
    await Promise.all([
      count("knowledge_base"),
      countMissing("knowledge_base"),
      count("tickets"),
      countMissing("tickets"),
      count("support_groups"),
      count("requirements"),
      count("test_cases"),
      count("test_executions"),
    ]);

  return {
    kbTotal: kbTotal.count || 0,
    kbMissing: kbMissing.count || 0,
    ticketTotal: ticketTotal.count || 0,
    ticketMissing: ticketMissing.count || 0,
    groups: groups.count || 0,
    requirements: requirements.count || 0,
    tests: tests.count || 0,
    executions: executions.count || 0,
  };
}

// Yapay zeka servisinin ayakta olup olmadığını ölçer
export async function pingAI() {
  const started = Date.now();
  try {
    const vector = await embed("sistem sağlık kontrolü", "query");
    return { ok: !!vector, ms: Date.now() - started, dim: vector?.length || 0 };
  } catch {
    return { ok: false, ms: Date.now() - started, dim: 0 };
  }
}
