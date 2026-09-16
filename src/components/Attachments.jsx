import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTheme } from "../lib/ThemeContext";
import { F } from "../lib/theme";
import { Icon } from "./UI";
import { ACCEPTED, uploadAttachment, deleteAttachment, humanSize } from "../lib/documents";

export function useAttachments({ ticketId, uploadedBy, dropZoneRef }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);

  const addFiles = useCallback(
    async (files) => {
      const list = Array.from(files || []).filter(Boolean);
      if (!list.length) return;

      setBusy(true);
      setError(null);

      for (const file of list) {
        const tempId = `temp-${Date.now()}-${Math.random()}`;
        setItems((prev) => [
          ...prev,
          { id: tempId, file_name: file.name, size_bytes: file.size, pending: true },
        ]);

        try {
          const saved = await uploadAttachment(file, { ticketId, uploadedBy });
          setItems((prev) => prev.map((i) => (i.id === tempId ? saved : i)));
        } catch (err) {
          setError(err.message);
          setItems((prev) => prev.filter((i) => i.id !== tempId));
        }
      }

      setBusy(false);
    },
    [ticketId, uploadedBy],
  );

  async function remove(item) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    if (!item.pending) await deleteAttachment(item);
  }

  useEffect(() => {
    const zone = dropZoneRef?.current;
    if (!zone) return;

    // İç içe elemanlara girip çıkarken örtünün titrememesi için sayaç
    let depth = 0;

    const onEnter = (e) => {
      e.preventDefault();
      if (!e.dataTransfer?.types?.includes("Files")) return;
      depth++;
      setDragging(true);
    };
    const onLeave = (e) => {
      e.preventDefault();
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (e) => e.preventDefault();
    const onDrop = (e) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
    };

    zone.addEventListener("dragenter", onEnter);
    zone.addEventListener("dragleave", onLeave);
    zone.addEventListener("dragover", onOver);
    zone.addEventListener("drop", onDrop);
    return () => {
      zone.removeEventListener("dragenter", onEnter);
      zone.removeEventListener("dragleave", onLeave);
      zone.removeEventListener("dragover", onOver);
      zone.removeEventListener("drop", onDrop);
    };
  }, [dropZoneRef, addFiles]);

  useEffect(() => {
    const onPaste = (e) => {
      const files = Array.from(e.clipboardData?.items || [])
        .filter((it) => it.kind === "file")
        .map((it) => it.getAsFile())
        .filter(Boolean);

      if (!files.length) return;
      e.preventDefault();

      // Panodan gelen görselin adı olmaz
      const named = files.map((f) =>
        f.name && f.name !== "image.png"
          ? f
          : new File([f], `ekran-goruntusu-${Date.now()}.png`, { type: f.type }),
      );
      addFiles(named);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  return { items, setItems, addFiles, remove, busy, dragging, error, setError };
}

export function AttachButton({ onFiles, disabled }) {
  const { C } = useTheme();
  const inputRef = useRef(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED}
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
        style={{ display: "none" }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        title="Dosya veya ekran görüntüsü ekle"
        aria-label="Dosya ekle"
        style={{
          width: 40,
          height: 40,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          borderRadius: 9,
          border: `1px solid ${C.lineStrong}`,
          background: disabled ? C.surfaceSunken : C.surface,
          color: disabled ? C.inkFaint : C.inkSoft,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <Icon name="plus" size={17} strokeWidth={2} />
      </button>
    </>
  );
}

export function DropOverlay({ visible }) {
  const { C } = useTheme();
  if (!visible) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        display: "grid",
        placeItems: "center",
        background: C.mode === "dark" ? "rgba(13,20,17,0.86)" : "rgba(244,248,243,0.88)",
        backdropFilter: "blur(3px)",
        borderRadius: 16,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          border: `2px dashed ${C.brand}`,
          borderRadius: 14,
          padding: "30px 46px",
          textAlign: "center",
          background: C.surface,
          color: C.brand,
        }}
      >
        <div style={{ marginBottom: 10 }}>
          <Icon name="upload" size={30} strokeWidth={1.7} />
        </div>
        <div style={{ fontFamily: F.display, fontSize: 17, fontWeight: 600, color: C.ink }}>
          Dosyanızı buraya bırakın
        </div>
        <div style={{ fontFamily: F.body, fontSize: 13, color: C.inkSoft, marginTop: 5 }}>
          Word, PDF, metin veya ekran görüntüsü
        </div>
      </div>
    </div>
  );
}

export function AttachmentList({ items, onRemove, compact }) {
  if (!items?.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {items.map((a) => (
        <AttachmentChip key={a.id} attachment={a} onRemove={onRemove} compact={compact} />
      ))}
    </div>
  );
}

const STATUS_LABEL = {
  tamam: "içerik okundu",
  bekliyor: "işleniyor",
  başarısız: "okunamadı",
  desteklenmiyor: "metin yok",
};

function AttachmentChip({ attachment: a, onRemove, compact }) {
  const { C } = useTheme();
  const isImage = a.kind === "image";

  const statusColor = {
    tamam: C.brand,
    bekliyor: C.inkFaint,
    başarısız: C.danger,
    desteklenmiyor: C.warn,
  }[a.extraction_status] || C.inkFaint;

  const statusText =
    a.extraction_status === "tamam" && !isImage
      ? "metin çıkarıldı"
      : STATUS_LABEL[a.extraction_status] || "";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 11px",
        borderRadius: 10,
        border: `1px solid ${C.line}`,
        background: C.surfaceAlt,
        maxWidth: 300,
      }}
    >
      {isImage && a.public_url ? (
        <img
          src={a.public_url}
          alt={a.file_name}
          style={{ width: 30, height: 30, borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
        />
      ) : (
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 6,
            display: "grid",
            placeItems: "center",
            background: C.surfaceSunken,
            color: C.inkSoft,
            flexShrink: 0,
          }}
        >
          <Icon name="file" strokeWidth={1.8} />
        </div>
      )}

      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          title={a.file_name}
          style={{
            fontFamily: F.body,
            fontSize: 12.5,
            color: C.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {a.file_name}
        </div>
        <div style={{ fontFamily: F.body, fontSize: 11, color: statusColor, marginTop: 1 }}>
          {a.pending ? "yükleniyor…" : `${humanSize(a.size_bytes)} · ${statusText}`}
        </div>
      </div>

      {onRemove && !compact && (
        <button
          onClick={() => onRemove(a)}
          aria-label="Kaldır"
          style={{
            background: "none",
            border: "none",
            color: C.inkFaint,
            cursor: "pointer",
            padding: 2,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="close" size={13} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}
