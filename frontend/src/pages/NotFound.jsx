import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button, EmptyState } from "../components/ui";

export default function NotFound() {
  return (
    <div className="card">
      <EmptyState icon={Compass} title="Page not found">
        <p>That page does not exist in SecureBank.</p>
        <Link to="/app" className="mt-4 inline-block">
          <Button variant="secondary">Go to dashboard</Button>
        </Link>
      </EmptyState>
    </div>
  );
}
