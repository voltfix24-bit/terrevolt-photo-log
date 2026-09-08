import { CSSProperties, HTMLAttributes, ButtonHTMLAttributes, ReactNode, forwardRef, useState } from "react";

export const T = {
  bg: "#E8F2E2",
  surface: "#FFFFFF",
  green: "#1F5C3A",
  titleOnBg: "#0A2A18",
  subOnBg: "#5E7A66",
  bodyOnBg: "#3D4F42",
  rowText: "#0A0A0A",
  rowSub: "#7A857A",
  done: "#8FA893",
  muted: "#B0B8B0",
  chevron: "#C4CCC4",
  hairline: "#E6EBE5",
  current: "#BA7517",
  danger: "#B3352C",
  dangerBg: "#FBEDEC",
  upload: "#1A4E8A",
  soft: "#F2F6F1",
  softBorder: "#D4DFD2",
} as const;

export const R = { screen: 20, group: 16, control: 16, small: 12 } as const;
export const M = { spring: "cubic-bezier(0.34,1.4,0.64,1)", ease: "cubic-bezier(0.22,1,0.36,1)" } as const;
export const ROW_MIN = 60;
export const ROW_PAD_X = 17;
export const SWIPE_ACTION_W = 74;
export const ICON = 23;
export const ICON_GAP = 14;
export const INSET_HEAD = ROW_PAD_X;
export const INSET_ROW = ROW_PAD_X + ICON + ICON_GAP;

export const glass = (alpha = 0.8): CSSProperties => ({
  background: `rgba(232,242,226,${alpha})`,
  WebkitBackdropFilter: "saturate(180%) blur(24px)",
  backdropFilter: "saturate(180%) blur(24px)",
});

export function Pressable({ children, style, scale = 0.94, type = "button", onPointerDown, onPointerUp, onPointerLeave, onPointerCancel, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { scale?: number }) {
  const [down, setDown] = useState(false);
  return (
    <button
      {...rest}
      type={type}
      onPointerDown={(event) => { setDown(true); onPointerDown?.(event); }}
      onPointerUp={(event) => { setDown(false); onPointerUp?.(event); }}
      onPointerLeave={(event) => { setDown(false); onPointerLeave?.(event); }}
      onPointerCancel={(event) => { setDown(false); onPointerCancel?.(event); }}
      style={{ border: "none", background: "none", padding: 0, font: "inherit", transform: down ? `scale(${scale})` : "scale(1)", transition: `transform 0.14s ${M.spring}`, ...style }}
    >
      {children}
    </button>
  );
}

export const Group = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Group({ children, style, ...rest }, ref) {
  return <div ref={ref} {...rest} style={{ background: T.surface, borderRadius: R.group, overflow: "hidden", marginBottom: 20, ...style }}>{children}</div>;
});

export function Hairline({ inset = INSET_ROW }: { inset?: number }) {
  return <div aria-hidden="true" style={{ height: "0.5px", background: T.hairline, marginLeft: inset }} />;
}

export function GlassBar({ children, position = "bottom", style }: { children: ReactNode; position?: "top" | "bottom"; style?: CSSProperties }) {
  const isBottom = position === "bottom";
  return (
    <div
      className="apple-glass"
      style={{
        position: "sticky",
        [isBottom ? "bottom" : "top"]: 0,
        zIndex: 20,
        padding: isBottom ? "11px 16px" : "13px 16px",
        paddingBottom: isBottom ? "calc(16px + env(safe-area-inset-bottom))" : undefined,
        paddingTop: isBottom ? undefined : "calc(13px + env(safe-area-inset-top))",
        [isBottom ? "borderTop" : "borderBottom"]: "0.5px solid rgba(31,92,58,0.12)",
        ...glass(isBottom ? 0.78 : 0.8),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
export function NavText({ children, style, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Pressable {...rest} style={{ minHeight: 44, minWidth: 58, display: "flex", alignItems: "center", color: T.green, fontSize: 17, fontWeight: 500, ...style }}>
      {children}
    </Pressable>
  );
}

export function Row({
  icon, iconColor, title, subtitle, trailing, chevron, onClick,
}: {
  icon?: string;
  iconColor?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
}) {
  const showChevron = chevron ?? Boolean(onClick);
  const inner = (
    <div style={{ minHeight: ROW_MIN, padding: `12px ${ROW_PAD_X}px`, display: "flex", alignItems: "center", gap: ICON_GAP, width: "100%", textAlign: "left" }}>
      {icon && <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: ICON, color: iconColor ?? T.green, flexShrink: 0 }}>{icon}</span>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: T.rowText, fontSize: 17, lineHeight: 1.3, overflowWrap: "anywhere" }}>{title}</div>
        {subtitle && <div style={{ marginTop: 2, color: T.rowSub, fontSize: 14 }}>{subtitle}</div>}
      </div>
      {trailing}
      {showChevron && <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 19, color: T.chevron, flexShrink: 0 }}>chevron_right</span>}
    </div>
  );
  if (!onClick) return inner;
  return <Pressable onClick={onClick} scale={0.98} style={{ display: "block", width: "100%" }}>{inner}</Pressable>;
}

export function PrimaryButton({ children, caption, disabled, style, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { caption?: ReactNode }) {
  return (
    <div style={{ maxWidth: 768, margin: "0 auto" }}>
      <Pressable
        {...rest}
        disabled={disabled}
        style={{
          width: "100%", minHeight: ROW_MIN, borderRadius: R.control,
          background: disabled ? T.done : T.green, color: T.surface,
          fontSize: 17, fontWeight: 500,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
          padding: "0 16px", ...style,
        }}
      >
        {children}
      </Pressable>
      {caption && <div style={{ marginTop: 8, textAlign: "center", fontSize: 13, color: T.subOnBg, lineHeight: 1.4 }}>{caption}</div>}
    </div>
  );
}
