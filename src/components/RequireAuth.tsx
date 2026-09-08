import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "@/hooks/use-session";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen" style={{ background: "#E8F2E2" }} />;
  }

  if (!session) {
    return <Navigate to="/auth" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
