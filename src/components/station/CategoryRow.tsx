import { Check, CheckCircle2 } from "lucide-react";
import { Pressable, T, ROW_MIN, ROW_PAD_X, ICON, ICON_GAP } from "@/components/apple/Primitives";
import type { MergedCategory } from "@/hooks/use-categories";
import type { FotoRow } from "./types";

export function VoltooidVink() {
  return (
    <span aria-hidden="true" style={{ position: "relative", display: "inline-flex", width: 16, height: 16, color: T.green, flexShrink: 0 }}>
      <CheckCircle2 size={16} strokeWidth={1.4} fill="currentColor" stroke="currentColor" />
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", transform: "translateY(0.7px)" }}>
        <Check size={11} strokeWidth={3.2} color={T.surface} />
      </span>
    </span>
  );
}

export function CategoryRow({ cat, fotos, isSkipped, skipReason, opmerking, onOpen }: {
  cat: MergedCategory; fotos: FotoRow[]; isSkipped?: boolean; skipReason?: string; opmerking?: string; onOpen: () => void;
}) {
  const hasPhotos = fotos.length > 0;

  const nvt = Boolean(isSkipped && !hasPhotos);
  const icon = nvt ? "block" : hasPhotos ? "check_circle" : "photo_camera";
  const iconColor = nvt ? T.bodyOnBg : T.green;
  return (
    <Pressable
      data-cat-id={cat.id}
      onClick={onOpen}
      scale={0.985}
      style={{ width: "100%", minHeight: ROW_MIN, display: "flex", alignItems: "center", gap: ICON_GAP, padding: `15px ${ROW_PAD_X}px`, textAlign: "left" }}
    >
      <span className="material-symbols-rounded shrink-0" style={{ fontSize: ICON, color: iconColor, fontVariationSettings: hasPhotos ? "'FILL' 1" : undefined }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, color: T.titleOnBg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cat.effectiveName}</div>
        {nvt && <div style={{ fontSize: 14, color: T.subOnBg, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><span style={{ fontWeight: 600 }}>N.v.t.</span> · {skipReason || "Geen reden opgegeven"}</div>}
        {opmerking && (
          <div style={{ fontSize: 14, color: "#8A6A00", marginTop: 2, display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 16, flexShrink: 0 }}>sticky_note_2</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opmerking.split("\n")[0]}</span>
          </div>
        )}
      </div>
      {hasPhotos && <span style={{ fontSize: 15, color: T.bodyOnBg, fontFamily: "ui-monospace, monospace" }}>{fotos.length}</span>}
      <span className="material-symbols-rounded shrink-0" style={{ fontSize: 19, color: T.chevron }}>chevron_right</span>
    </Pressable>
  );
}
