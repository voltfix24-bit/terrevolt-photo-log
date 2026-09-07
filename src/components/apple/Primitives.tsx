import { CSSProperties, HTMLAttributes, ButtonHTMLAttributes, ReactNode, useState } from "react";

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
export const ROW_MIN = 58;
export const ROW_PAD_X = 17;
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

export function Group({ children, style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} style={{ background: T.surface, borderRadius: R.group, overflow: "hidden", marginBottom: 20, ...style }}>{children}</div>;
}

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