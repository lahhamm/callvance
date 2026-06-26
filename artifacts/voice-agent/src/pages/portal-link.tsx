import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { setClientSession } from "@/lib/auth";
import { PhoneCall } from "lucide-react";

export default function PortalLink() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError("Invalid link."); return; }

    fetch(`/api/client/${token}`)
      .then(r => {
        if (!r.ok) throw new Error("invalid");
        return r.json();
      })
      .then((data: { id: number; name: string; businessType: string }) => {
        setClientSession(token, data.id, data.name);
        navigate("/portal");
      })
      .catch(() => setError("This link is invalid or has been revoked. Contact your account manager."));
  }, [token, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto">
          <PhoneCall className="w-6 h-6 text-white" />
        </div>
        {error ? (
          <>
            <p className="text-gray-800 font-semibold">Access denied</p>
            <p className="text-sm text-gray-500 max-w-xs">{error}</p>
          </>
        ) : (
          <>
            <p className="text-gray-800 font-semibold">Signing you in…</p>
            <p className="text-sm text-gray-400">You'll be redirected shortly.</p>
          </>
        )}
      </div>
    </div>
  );
}
