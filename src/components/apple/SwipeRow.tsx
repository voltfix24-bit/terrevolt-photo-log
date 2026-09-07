import { PointerEvent, ReactNode, useEffect, useRef, useState } from "react";
import { M, SWIPE_ACTION_W, T } from "@/components/apple/Primitives";

type SwipeAction = "pdf" | "share" | "delete";

const actions: Array<{ key: SwipeAction; icon: string; label: string; background: string }> = [
  { key: "pdf", icon: "description", label: "Pdf", background: T.done },
  { key: "share", icon: "ios_share", label: "Delen", background: T.green },
  { key: "delete", icon: "delete", label: "Wis", background: T.danger },
];

const OPEN_X = -(actions.length * SWIPE_ACTION_W);

export function SwipeRow({
  id,
  children,
  openSwipeId,
  onOpen,
  onAction,
  onCloseOthers,
}: {
  id: string;
  children: ReactNode;
  openSwipeId: string | null;
  onOpen: () => void;
  onAction: (action: SwipeAction) => void;
  onCloseOthers: (id: string | null) => void;
}) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const base = useRef(0);
  const moved = useRef(false);
  const horizontal = useRef(false);

  useEffect(() => {
    if (openSwipeId !== id && !dragging) setX(0);
  }, [dragging, id, openSwipeId]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    startX.current = event.clientX;
    startY.current = event.clientY;
    base.current = x;
    moved.current = false;
    horizontal.current = false;
    setDragging(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const dx = event.clientX - startX.current;
    const dy = event.clientY - startY.current;
    if (!horizontal.current && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
      horizontal.current = true;
      moved.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    if (!horizontal.current) return;
    setX(Math.min(0, Math.max(OPEN_X, base.current + dx)));
  };

  const finishDrag = () => {
    if (!dragging) return;
    setDragging(false);
    if (!horizontal.current) return;
    if (x < OPEN_X / 2.6) {
      onCloseOthers(id);
      setX(OPEN_X);
    } else {
      onCloseOthers(null);
      setX(0);
    }
  };

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div aria-hidden={x === 0} style={{ position: "absolute", inset: "0 0 0 auto", display: "flex" }}>
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            tabIndex={x === 0 ? -1 : 0}
            onClick={() => { onAction(action.key); onCloseOthers(null); setX(0); }}
            aria-label={action.label}
            style={{
              width: SWIPE_ACTION_W,
              border: 0,
              background: action.background,
              color: T.surface,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
            }}
          >
            <span className="material-symbols-rounded" style={{ fontSize: 21 }}>{action.icon}</span>
            <span style={{ fontSize: 11 }}>{action.label}</span>
          </button>
        ))}
      </div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Station openen"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(); }}
        onClick={() => {
          if (moved.current) return;
          if (x !== 0) {
            onCloseOthers(null);
            setX(0);
            return;
          }
          onOpen();
        }}
        style={{
          position: "relative",
          background: T.surface,
          transform: `translateX(${x}px)`,
          transition: dragging ? "none" : `transform 0.32s ${M.ease}`,
          touchAction: "pan-y",
          userSelect: "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}