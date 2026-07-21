"use client";

/**
 * components/pm/ExportButton.tsx
 * -----------------------------------------------------------------------------
 * One-click Excel export: fetches the .xlsx from
 * /api/projects/:id/export (built server-side with SheetJS, see that route's
 * header comment) as a blob and triggers a browser download.
 * -----------------------------------------------------------------------------
 */

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

export default function ExportButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/export`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Export failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "project"}_export.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleExport}
        disabled={downloading}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-60"
      >
        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Export to Excel
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
