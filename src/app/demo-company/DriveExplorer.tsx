"use client";

import { useMemo, useState } from "react";
import type { FdcDocument } from "@/data/fdc";

const categoryColor: Record<string, string> = {
  Strategy: "bg-violet-100 text-violet-700",
  Finance: "bg-emerald-100 text-emerald-700",
  Revenue: "bg-blue-100 text-blue-700",
  Product: "bg-amber-100 text-amber-700",
  Operations: "bg-orange-100 text-orange-700",
  People: "bg-pink-100 text-pink-700",
  Security: "bg-slate-200 text-slate-700",
  Support: "bg-cyan-100 text-cyan-700",
};

function pdfUrl(fileName: string): string {
  return `/demo-company/fdc/${encodeURIComponent(fileName)}`;
}

export default function DriveExplorer({ documents }: { documents: FdcDocument[] }) {
  const [category, setCategory] = useState("All PDFs");
  const [query, setQuery] = useState("");

  const categories = useMemo(
    () => ["All PDFs", ...new Set(documents.map((document) => document.category))],
    [documents],
  );
  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return documents.filter((document) => {
      const matchesCategory = category === "All PDFs" || document.category === category;
      const matchesQuery =
        !normalizedQuery ||
        document.fileName.toLowerCase().includes(normalizedQuery) ||
        document.summary.toLowerCase().includes(normalizedQuery) ||
        document.owner.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, documents, query]);

  return (
    <section className="overflow-hidden rounded-2xl border border-foreground/10 bg-white shadow-sm shadow-accent/5">
      <div className="flex flex-col gap-4 border-b border-foreground/10 bg-[#f5f9ff] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent/70">
            FDC document library
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            {documents.length} source PDFs
          </h2>
          <p className="mt-1 text-xs text-foreground/55">
            Generated into <code>data/fdc</code>, parsed by Unsiloed, then indexed in Moss.
          </p>
        </div>
        <label className="relative block w-full sm:w-72">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35">
            ⌕
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search PDFs"
            className="w-full rounded-full border border-foreground/15 bg-white py-2.5 pl-8 pr-3 text-sm outline-none focus:border-accent/50"
          />
        </label>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-foreground/10 px-5 py-3">
        {categories.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setCategory(name)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              category === name
                ? "bg-accent text-white"
                : "border border-foreground/10 bg-white text-foreground/65 hover:border-accent/40"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="divide-y divide-foreground/8">
        {visible.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm text-foreground/45">
            No PDFs match “{query}”.
          </p>
        ) : (
          visible.map((document) => (
            <a
              key={document.fileName}
              href={pdfUrl(document.fileName)}
              target="_blank"
              rel="noreferrer"
              className="group grid gap-3 px-5 py-4 transition hover:bg-[#f1f6ff] sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:items-center"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#e8453c] font-mono text-[10px] font-bold text-white">
                PDF
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold group-hover:text-accent">
                    {document.fileName}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider ${
                      categoryColor[document.category] ?? "bg-stone-200 text-stone-700"
                    }`}
                  >
                    {document.category}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-foreground/55">{document.summary}</p>
                <p className="mt-1 text-[10px] text-foreground/40">
                  {document.owner} · {document.pages.length} pages · Updated {document.updated}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 sm:max-w-52 sm:justify-end">
                <span className="rounded-full bg-[#6f3df4]/10 px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-[#5930c5]">
                  Parsed · Unsiloed
                </span>
                <span className="rounded-full bg-accent/10 px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-accent">
                  Indexed · Moss
                </span>
                <span className="w-full text-right text-[10px] font-medium text-accent/70">
                  Open PDF ↗
                </span>
              </div>
            </a>
          ))
        )}
      </div>
    </section>
  );
}
