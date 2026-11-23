"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Uploads go to the JSON API rather than a server action, whose request limit (1 MB) is smaller than a phone photo.
export function PhotoForm({ id, hasPhoto }: { id: number; hasPhoto: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState("");

  // POST asks the server to find the product's picture in the store's catalog.
  async function send(method: "PUT" | "DELETE" | "POST", body?: File) {
    setStatus(method === "PUT" ? "Uploading…" : method === "POST" ? "Finding…" : "Removing…");
    const response = await fetch(`/api/shopping/${id}/photo${method === "POST" ? "/find" : ""}`, { method, body }).catch(() => null);
    if (!response?.ok) {
      const reason = await response?.json().then((r: { error?: string }) => r.error).catch(() => undefined);
      setStatus(reason ?? "Couldn't reach the server.");
      return;
    }
    setStatus("");
    router.refresh();
  }

  return (
    <div className="row">
      <label className="shop-photo-pick">
        {hasPhoto ? "Replace photo" : "Add photo"}
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) send("PUT", file); }} />
      </label>
      <button className="link" onClick={() => send("POST")}>Find product photo</button>
      {hasPhoto && <button className="link danger" onClick={() => send("DELETE")}>Remove photo</button>}
      {status && <span className="muted" role="status">{status}</span>}
    </div>
  );
}
