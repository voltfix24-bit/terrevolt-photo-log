import { Link } from "react-router-dom";
import { T } from "@/components/apple/Primitives";

const NotFound = () => (
  <main className="flex min-h-screen items-center justify-center px-6" style={{ background: T.bg }}>
    <div className="text-center" style={{ maxWidth: 360 }}>
      <h1 className="mb-3 text-4xl font-bold" style={{ color: T.titleOnBg }}>404</h1>
      <p className="mb-6 text-lg" style={{ color: T.subOnBg }}>Deze pagina bestaat niet (meer). Controleer de link of ga terug naar de stations.</p>
      <Link to="/" className="inline-flex items-center justify-center rounded-xl px-6 font-semibold" style={{ minHeight: 48, background: T.green, color: "#fff" }}>
        Terug naar stations
      </Link>
    </div>
  </main>
);

export default NotFound;
