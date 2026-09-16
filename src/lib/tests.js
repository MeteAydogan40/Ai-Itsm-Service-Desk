import { supabase } from "./supabase";

/**
 * Onaylanmış gereksinimlerden test senaryosu üretir.
 *
 * Onaylanmamış gereksinim henüz doğrulanmamış bir çıkarım;
 * ondan test üretmek hatayı bir katman aşağı taşır.
 */
export async function generateTests({ ticket, requirements }) {
  const approved = (requirements || []).filter((r) => r.approved);
  if (!approved.length) {
    return { error: "Önce en az bir gereksinimi onaylamanız gerekiyor." };
  }

  const { data, error } = await supabase.functions.invoke("analyze", {
    body: {
      task: "tests",
      ticketTitle: ticket?.title,
      affectedSystem: ticket?.affected_system,
      requirements: approved.map((r) => ({
        code: r.code,
        title: r.title,
        description: r.description || "",
        reqType: r.req_type,
        priority: r.priority,
      })),
    },
  });

  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };

  const idByCode = Object.fromEntries(approved.map((r) => [r.code, r.id]));

  const rows = (data.tests || [])
    .map((t, i) => ({
      ticket_id: ticket.id,
      requirement_id: idByCode[t.requirementCode] || null,
      code: t.code,
      title: t.title,
      test_type: t.testType,
      preconditions: t.preconditions || null,
      steps: t.steps || [],
      expected_result: t.expectedResult,
      is_critical: t.isCritical,
      critical_reason: t.isCritical ? t.criticalReason || null : null,
      created_by: "ai",
      sort_order: i,
    }))
    // İzlenebilirliği olmayan test, izlenemez bir iddiadır
    .filter((r) => r.requirement_id);

  if (!rows.length) {
    return { error: "Gereksinimlere bağlanabilen test üretilemedi. Tekrar deneyin." };
  }

  // Yeniden üretimde insan emeği korunur
  await supabase
    .from("test_cases")
    .delete()
    .eq("ticket_id", ticket.id)
    .eq("created_by", "ai")
    .eq("edited_by_human", false);

  const { data: inserted, error: insertError } = await supabase
    .from("test_cases")
    .insert(rows)
    .select();

  if (insertError) return { error: insertError.message };
  return { tests: inserted || [], coverageNote: data.coverageNote };
}

export async function loadTests(ticketId) {
  const [cases, statuses] = await Promise.all([
    supabase
      .from("test_cases")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("sort_order", { ascending: true }),
    supabase.from("test_latest_status").select("*"),
  ]);

  const latestByCase = Object.fromEntries(
    (statuses.data || []).map((s) => [s.test_case_id, s]),
  );

  return (cases.data || []).map((t) => ({ ...t, latest: latestByCase[t.id] || null }));
}

export async function loadTestHistory(testCaseId) {
  const { data } = await supabase
    .from("test_executions")
    .select("*, attachments(file_name, public_url, kind)")
    .eq("test_case_id", testCaseId)
    .order("executed_at", { ascending: false });
  return data || [];
}

/**
 * Her işaretleme yeni bir satır; üzerine yazılmaz.
 * Bir test önce başarısız olup sonra geçtiyse ikisi de kayıtta kalır.
 */
export async function recordExecution({ testCaseId, ticketId, result, note, attachmentId, executedBy }) {
  const { data, error } = await supabase
    .from("test_executions")
    .insert({
      test_case_id: testCaseId,
      ticket_id: ticketId,
      result,
      note: note?.trim() || null,
      attachment_id: attachmentId || null,
      executed_by: executedBy,
    })
    .select()
    .single();

  return error ? { error: error.message } : { execution: data };
}

export async function updateTest(id, patch) {
  const { data } = await supabase
    .from("test_cases")
    .update({ ...patch, edited_by_human: true })
    .eq("id", id)
    .select()
    .single();
  return data;
}

export function toggleCritical(id, isCritical) {
  return updateTest(id, { is_critical: isCritical });
}

export async function deleteTest(id) {
  await supabase.from("test_cases").delete().eq("id", id);
}

export async function addManualTest({ ticketId, requirementId, values, order }) {
  const { data, error } = await supabase
    .from("test_cases")
    .insert({
      ticket_id: ticketId,
      requirement_id: requirementId,
      code: values.code,
      title: values.title,
      test_type: values.test_type,
      preconditions: values.preconditions || null,
      steps: values.steps || [],
      expected_result: values.expected_result,
      is_critical: values.is_critical || false,
      critical_reason: values.critical_reason || null,
      created_by: "human",
      edited_by_human: true,
      sort_order: order,
    })
    .select()
    .single();

  return error ? { error: error.message } : { test: data };
}

const EMPTY_CLOSURE = { total: 0, critical: 0, passed: 0, failed: 0, pending: 0, canClose: true };

/**
 * Kapatma uygunluğunu veritabanındaki fonksiyondan okur.
 * Kural burada tekrar yazılmaz — iki yerde duran kural, biri
 * güncellenip diğeri unutulduğunda sessizce bozulur.
 */
export async function checkClosure(ticketId) {
  const { data, error } = await supabase.rpc("check_closure_readiness", {
    p_ticket_id: ticketId,
  });

  if (error || !data?.length) return EMPTY_CLOSURE;

  const r = data[0];
  return {
    total: Number(r.total_tests),
    critical: Number(r.critical_tests),
    passed: Number(r.critical_passed),
    failed: Number(r.critical_failed),
    pending: Number(r.critical_pending),
    canClose: r.can_close,
  };
}

export function nextTestCode(tests) {
  const numbers = (tests || [])
    .map((t) => parseInt(String(t.code).replace(/\D/g, ""), 10))
    .filter(Number.isFinite);

  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  return `TEST-${String(next).padStart(2, "0")}`;
}
