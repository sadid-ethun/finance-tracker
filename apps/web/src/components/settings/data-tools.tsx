"use client";

import { useState } from "react";
import { Download, Upload } from "lucide-react";

import { useAccounts } from "@/hooks/use-finance";

/**
 * CSV import and export.
 *
 * Import is two steps on purpose: detect the columns, then let the user
 * confirm the mapping. Guessing silently is how a date column becomes an
 * amount column and a year of history lands wrong.
 */
export function DataTools() {
  const accounts = useAccounts();
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null> | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [accountId, setAccountId] = useState("");
  const [invert, setInvert] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState<"csv" | "json" | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  /**
   * Fetch then save as a blob rather than linking directly.
   *
   * A plain anchor would let the client router intercept the navigation, and a
   * failed export would be "downloaded" as a file full of error JSON. This way
   * a failure surfaces as a message.
   */
  async function download(format: "csv" | "json") {
    setDownloadError(null);
    setDownloading(format);
    try {
      const res = await fetch(`/api/proxy/api/v1/data/export?format=${format}`);
      if (!res.ok) {
        setDownloadError("Export failed. Please try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `finance-export-${new Date().toISOString().slice(0, 10)}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError("Export failed. Please try again.");
    } finally {
      setDownloading(null);
    }
  }

  async function onFile(selected: File) {
    setError(null);
    setResult(null);
    setFile(selected);

    // Read the header row locally so the dropdowns can offer every column,
    // not just the ones the server recognised.
    const text = await selected.text();
    setHeaders((text.split(/\r?\n/)[0] ?? "").split(",").map((h) => h.trim()));

    const body = new FormData();
    body.append("file", selected);
    const res = await fetch("/api/proxy/api/v1/data/import/detect", {
      method: "POST",
      body,
    });
    if (!res.ok) {
      setError("Couldn't read that file.");
      return;
    }
    setMapping(await res.json());
  }

  async function runImport() {
    if (!file || !mapping || !accountId) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("account_id", accountId);
      body.append("mapping", JSON.stringify(mapping));
      body.append("invert_amounts", String(invert));

      const res = await fetch("/api/proxy/api/v1/data/import", {
        method: "POST",
        body,
      });
      if (!res.ok) {
        setError("Import failed.");
        return;
      }
      setResult(await res.json());
      setFile(null);
      setMapping(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-border bg-card p-5">
        <h2 className="text-[16px] font-semibold">Export</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          CSV writes dollars for spreadsheets. JSON preserves exact values for backup.
        </p>
        <div className="mt-4 flex gap-2">
          {(["csv", "json"] as const).map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => void download(format)}
              disabled={downloading !== null}
              className="inline-flex h-10 items-center gap-1.5 rounded-[14px] border border-border px-4 text-[14px] font-medium uppercase disabled:opacity-60"
            >
              <Download className="size-4" />
              {downloading === format ? "Preparing…" : format}
            </button>
          ))}
        </div>
        {downloadError ? (
          <p role="alert" className="mt-2 text-[13px] text-negative">
            {downloadError}
          </p>
        ) : null}
      </section>

      <section className="rounded-card border border-border bg-card p-5">
        <h2 className="text-[16px] font-semibold">Import</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Upload a CSV from your bank, then confirm which column is which.
        </p>

        <label className="mt-4 flex h-11 w-full cursor-pointer items-center gap-2 rounded-[14px] border border-dashed border-border px-4 text-[14px] font-medium">
          <Upload className="size-4" />
          {file ? file.name : "Choose a CSV file"}
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) void onFile(selected);
            }}
          />
        </label>

        {mapping ? (
          <div className="mt-4 space-y-3">
            <div>
              <label
                htmlFor="import-account"
                className="mb-1.5 block text-[13px] font-medium"
              >
                Import into
              </label>
              <select
                id="import-account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="h-11 w-full rounded-[14px] border border-input bg-background px-3 text-[15px] outline-none focus:border-ring"
              >
                <option value="">Select an account…</option>
                {(accounts.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            {Object.keys(mapping).map((field) => (
              <div key={field} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[13px] font-medium capitalize">
                  {field}
                  {field === "date" || field === "amount" ? " *" : ""}
                </span>
                <select
                  value={mapping[field] ?? ""}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [field]: e.target.value || null }))
                  }
                  aria-label={`Column for ${field}`}
                  className="h-10 flex-1 rounded-[12px] border border-input bg-background px-2.5 text-[14px] outline-none focus:border-ring"
                >
                  <option value="">— not mapped —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={invert}
                onChange={(e) => setInvert(e.target.checked)}
                className="size-4 rounded border-input"
              />
              Flip the sign — my bank exports spending as positive
            </label>

            <button
              type="button"
              onClick={runImport}
              disabled={busy || !accountId || !mapping.date || !mapping.amount}
              className="h-11 w-full rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Importing…" : "Import transactions"}
            </button>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 text-[13px] text-negative">
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="mt-4 rounded-[14px] bg-secondary p-3 text-[13px]">
            <p className="font-medium">
              Imported {result.imported}
              {result.skipped > 0 ? `, skipped ${result.skipped}` : ""}.
            </p>
            {result.errors.length > 0 ? (
              <ul className="mt-2 space-y-0.5 text-muted-foreground">
                {result.errors.slice(0, 5).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
