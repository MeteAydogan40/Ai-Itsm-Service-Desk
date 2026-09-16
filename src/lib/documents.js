import { supabase } from "./supabase";

export const ACCEPTED = ".pdf,.docx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp";

const MAX_SIZE = 15 * 1024 * 1024;
const MAX_DOCUMENT_CHARS = 30000;
const BASE64_CHUNK = 8192;

function kindOf(file) {
  const name = file.name.toLowerCase();
  if (/\.(png|jpe?g|webp|gif)$/.test(name)) return "image";
  if (/\.(pdf|docx|txt|md|csv)$/.test(name)) return "document";
  return "other";
}

/* ---------- Text extraction ---------- */

/**
 * Dosyadan metni tarayıcıda çıkarır. Kütüphaneler dinamik import
 * ediliyor: kullanıcı dosya yüklemedikçe indirilmiyorlar.
 */
export async function extractText(file) {
  const name = file.name.toLowerCase();

  try {
    if (/\.(txt|md|csv)$/.test(name)) {
      return { text: await file.text(), status: "tamam" };
    }

    if (name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return { text: value, status: "tamam" };
    }

    if (name.endsWith(".pdf")) {
      return await extractPdfText(file);
    }

    return { text: "", status: "desteklenmiyor", note: "Bu dosya tipinden metin çıkarılamıyor." };
  } catch (err) {
    console.warn("Metin çıkarılamadı:", err.message);
    return { text: "", status: "başarısız", note: err.message };
  }
}

async function extractPdfText(file) {
  const pdfjs = await import("pdfjs-dist");

  // Ağır iş ayrı bir worker'da yapılıyor, sayfa donmuyor
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;

  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    text += content.items.map((it) => it.str).join(" ") + "\n\n";
  }

  if (!text.trim()) {
    return {
      text: "",
      status: "desteklenmiyor",
      note: "Bu PDF taranmış görüntü içeriyor, metin katmanı yok.",
    };
  }

  return { text, status: "tamam" };
}

/* ---------- Image analysis ---------- */

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  // Tek seferde çevirmek büyük dosyalarda yığın taşmasına yol açıyor
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
}

export async function analyzeImage(file) {
  try {
    const { data, error } = await supabase.functions.invoke("analyze", {
      body: {
        task: "image",
        base64: await fileToBase64(file),
        mimeType: file.type || "image/png",
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    const text = [
      data.application && `Uygulama: ${data.application}`,
      data.errorCode && `Hata kodu: ${data.errorCode}`,
      data.visibleText && `Ekrandaki metin: ${data.visibleText}`,
      data.description,
    ]
      .filter(Boolean)
      .join("\n");

    return { text, status: "tamam", raw: data };
  } catch (err) {
    console.warn("Görsel analiz edilemedi:", err.message);
    return { text: "", status: "başarısız", note: err.message };
  }
}

/* ---------- Attachments ---------- */

export async function uploadAttachment(file, { ticketId, uploadedBy }) {
  if (file.size > MAX_SIZE) {
    throw new Error(`Dosya çok büyük (${Math.round(file.size / 1024 / 1024)} MB). Sınır 15 MB.`);
  }

  const kind = kindOf(file);
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const path = `${ticketId || "taslak"}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("attachments")
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (uploadError) throw new Error(`Yükleme başarısız: ${uploadError.message}`);

  const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(path);
  const extraction = kind === "image" ? await analyzeImage(file) : await extractText(file);

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      ticket_id: ticketId || null,
      file_name: file.name,
      file_path: path,
      public_url: urlData?.publicUrl || null,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: uploadedBy || null,
      kind,
      extracted_text: extraction.text || null,
      extraction_status: extraction.status,
      extraction_note: extraction.note || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Kayıt başarısız: ${error.message}`);
  return data;
}

// Dosyalar çağrı oluşmadan önce yüklenebiliyor; sonradan bağlanıyorlar
export async function linkAttachmentsToTicket(attachmentIds, ticketId) {
  if (!attachmentIds?.length) return;
  await supabase.from("attachments").update({ ticket_id: ticketId }).in("id", attachmentIds);
}

export async function loadAttachments(ticketId) {
  const { data } = await supabase
    .from("attachments")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  return data || [];
}

export async function deleteAttachment(attachment) {
  await supabase.storage.from("attachments").remove([attachment.file_path]);
  await supabase.from("attachments").delete().eq("id", attachment.id);
}

/* ---------- Requirements ---------- */

export async function extractRequirements({ ticket, attachments }) {
  const readable = (attachments || []).filter((a) => a.extracted_text);

  const documentText = readable
    .map((a) => `### ${a.file_name}\n${a.extracted_text}`)
    .join("\n\n");

  if (!documentText.trim()) {
    return { error: "Metin çıkarılabilen bir doküman yok." };
  }

  const { data, error } = await supabase.functions.invoke("analyze", {
    body: {
      task: "requirements",
      documentText: documentText.slice(0, MAX_DOCUMENT_CHARS),
      ticketTitle: ticket?.title,
      ticketDescription: ticket?.description,
    },
  });

  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };

  const sourceAttachmentId = readable.length === 1 ? readable[0].id : null;

  const rows = (data.requirements || []).map((r) => ({
    ticket_id: ticket.id,
    attachment_id: sourceAttachmentId,
    code: r.code,
    title: r.title,
    description: r.description,
    req_type: r.reqType,
    priority: r.priority,
    source_quote: r.sourceQuote,
    confidence: r.confidence,
    ambiguous: r.ambiguous,
    ambiguity_note: r.ambiguityNote || null,
  }));

  // Onaylanmış ve düzenlenmiş maddelere dokunulmuyor
  await supabase
    .from("requirements")
    .delete()
    .eq("ticket_id", ticket.id)
    .eq("approved", false)
    .eq("edited_by_human", false);

  const { data: inserted, error: insertError } = await supabase
    .from("requirements")
    .insert(rows)
    .select();

  if (insertError) return { error: insertError.message };

  return {
    requirements: inserted || [],
    summary: data.documentSummary,
    openQuestions: data.openQuestions || [],
  };
}

export async function loadRequirements(ticketId) {
  const { data } = await supabase
    .from("requirements")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("code", { ascending: true });
  return data || [];
}

export async function updateRequirement(id, patch) {
  const { data } = await supabase
    .from("requirements")
    .update({ ...patch, edited_by_human: true })
    .eq("id", id)
    .select()
    .single();
  return data;
}

export async function approveRequirement(id, approved) {
  const { data } = await supabase
    .from("requirements")
    .update({ approved })
    .eq("id", id)
    .select()
    .single();
  return data;
}

export async function deleteRequirement(id) {
  await supabase.from("requirements").delete().eq("id", id);
}

/* ---------- Formatting ---------- */

export function humanSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
