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
    <section className="overflow-hidden rounded-2xl border border-[#17231d]/10 bg-[#fbfaf7] shadow-[0_1px_0_rgba(23,35,29,0.03)]">
      <div className="flex flex-col gap-4 border-b border-[#17231d]/10 bg-[#f8f6f0] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#173f33]/55">
            FDC document library
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            {documents.length} source PDFs
          </h2>
          <p className="mt-1 text-xs text-[#17231d]/55">
            Generated into <code>data/fdc</code>, parsed by Unsiloed, then indexed in Moss.
          </p>
        </div>
        <label className="relative block w-full sm:w-72">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#17231d]/35">
            ⌕
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search PDFs"
            className="w-full rounded-full border border-[#17231d]/15 bg-white py-2.5 pl-8 pr-3 text-sm outline-none focus:border-[#173f33]/40"
          />
        </label>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-[#17231d]/10 px-5 py-3">
        {categories.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setCategory(name)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              category === name
                ? "bg-[#173f33] text-white"
                : "border border-[#17231d]/10 bg-white text-[#17231d]/65 hover:border-[#173f33]/30"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="divide-y divide-[#17231d]/8">
        {visible.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm text-[#17231d]/45">
            No PDFs match “{query}”.
          </p>
        ) : (
          visible.map((document) => (
            <a
              key={document.fileName}
              href={pdfUrl(document.fileName)}
              target="_blank"
              rel="noreferrer"
              className="group grid gap-3 px-5 py-4 transition hover:bg-[#f3f0e8] sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:items-center"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#e8453c] font-mono text-[10px] font-bold text-white">
                PDF
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold group-hover:text-[#173f33]">
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
                <p className="mt-1 text-xs leading-5 text-[#17231d]/55">{document.summary}</p>
                <p className="mt-1 text-[10px] text-[#17231d]/40">
                  {document.owner} · {document.pages.length} pages · Updated {document.updated}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 sm:max-w-52 sm:justify-end">
                <span className="rounded-full bg-[#6f3df4]/10 px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-[#5930c5]">
                  Parsed · Unsiloed
                </span>
                <span className="rounded-full bg-[#173f33]/10 px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-[#173f33]">
                  Indexed · Moss
                </span>
                <span className="w-full text-right text-[10px] font-medium text-[#173f33]/55">
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
