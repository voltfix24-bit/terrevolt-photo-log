import { useInstellingen } from "@/hooks/use-theme";

// Dagen tot de SharePoint-sleutel verloopt (null = onbekend)
export function dagenTotVerlopen(datum: string | null | undefined, nu = new Date()): number | null {
  if (!datum) return null;
  return Math.ceil((new Date(`${datum}T23:59:59`).getTime() - nu.getTime()) / 86_400_000);
}

export function SharePointSleutelBanner() {
  const { data } = useInstellingen();
  const inst = data as any;
  if (!inst) return null;
  const dagen = dagenTotVerlopen(inst.sp_sleutel_verloopt_op);
  const kapot = !!inst.sp_auth_fout || (dagen !== null && dagen < 0);
  if (!kapot && (dagen === null || dagen > 30)) return null;
  const tekst = kapot
    ? "SharePoint-koppeling werkt niet meer: sleutel vernieuwen"
    : `De SharePoint-sleutel verloopt over ${dagen} ${dagen === 1 ? "dag" : "dagen"}`;
  return (
    <div
      role="alert"
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        paddingTop: "max(env(safe-area-inset-top), 6px)", paddingBottom: 6, paddingLeft: 16, paddingRight: 16,
        background: kapot ? "#C62828" : "#E8711A", color: "#fff",
        fontSize: 13, fontWeight: 600, textAlign: "center",
      }}
    >
      {tekst}
    </div>
  );
}
