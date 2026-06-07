"use client";

import { useEffect, useMemo, useState } from "react";
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

function PdfGlyph({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md bg-[#e8453c] font-mono text-[9px] font-bold tracking-tight text-white ${className}`}
    >
      PDF
    </span>
  );
}

function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length < 60 &&
    !trimmed.includes(" | ") &&
    /[A-Z]/.test(trimmed) &&
    trimmed === trimmed.toUpperCase()
  );
}

function PageLine({ line }: { line: string }) {
  if (line.trim() === "") return <div className="h-3" />;
  if (line.includes(" | ")) {
    return (
      <p className="whitespace-pre-wrap font-mono text-[12px] leading-5 text-[#17231d]/75">{line}</p>
    );
  }
  if (isHeadingLine(line)) {
    return (
      <p className="mt-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#27705a]">
        {line}
      </p>
    );
  }
  return <p className="text-[13.5px] leading-6 text-[#17231d]/80">{line}</p>;
}

function FilePreview({ document, onClose }: { document: FdcDocument; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-[#17231d]/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-4xl flex-col overflow-hidden bg-[#f5f3ec] shadow-2xl sm:h-[86vh] sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#17231d]/10 bg-[#f8f6f0] px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <PdfGlyph className="h-7 w-9 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold sm:text-base">{document.fileName}</p>
              <p className="truncate text-[11px] text-[#17231d]/50">
                {document.owner} · Modified {document.updated} · {document.pages.length} pages
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full border border-[#17231d]/15 px-3 py-1 text-sm text-[#17231d]/70 hover:bg-[#17231d]/5"
            aria-label="Close preview"
          >
            Close ✕
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-[#17231d]/10 bg-[#efece3] px-4 py-2 sm:px-6">
          <span
            className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wider ${
              categoryColor[document.category] ?? "bg-stone-200 text-stone-700"
            }`}
          >
            {document.category}
          </span>
          <span className="rounded-full bg-[#173f33]/10 px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-[#173f33]">
            Indexed in Moss
          </span>
          <span className="ml-auto hidden text-[11px] text-[#17231d]/45 sm:inline">
            Paige cites this file and page when she answers
          </span>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-[#e9e6dc] px-3 py-5 sm:px-8">
          {document.pages.map((page, index) => (
            <article
              key={`${document.fileName}-${index}`}
              className="mx-auto max-w-2xl rounded-md border border-[#17231d]/10 bg-white px-6 py-7 shadow-sm sm:px-10 sm:py-10"
            >
              <div className="mb-4 flex items-center justify-between border-b border-[#17231d]/10 pb-3">
                <h3 className="text-base font-semibold tracking-tight">{page.title}</h3>
                <span className="font-mono text-[10px] text-[#17231d]/40">Page {index + 1}</span>
              </div>
              <div className="space-y-0.5">
                {page.lines.map((line, lineIndex) => (
                  <PageLine key={lineIndex} line={line} />
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DriveExplorer({ documents }: { documents: FdcDocument[] }) {
  const [folder, setFolder] = useState<string>("All files");
  const [query, setQuery] = useState("");
  const [openDoc, setOpenDoc] = useState<FdcDocument | null>(null);

  const folders = useMemo(() => {
    const seen = new Map<string, number>();
    for (const doc of documents) seen.set(doc.category, (seen.get(doc.category) ?? 0) + 1);
    return [...seen.entries()].map(([name, count]) => ({ name, count }));
  }, [documents]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((doc) => {
      const inFolder = folder === "All files" || doc.category === folder;
      const matches =
        !q ||
        doc.title.toLowerCase().includes(q) ||
        doc.fileName.toLowerCase().includes(q) ||
        doc.summary.toLowerCase().includes(q) ||
        doc.owner.toLowerCase().includes(q);
      return inFolder && matches;
    });
  }, [documents, folder, query]);

  return (
    <div className="overflow-hidden rounded-2xl border border-[#17231d]/10 bg-[#fbfaf7] shadow-[0_1px_0_rgba(23,35,29,0.03)]">
      <div className="grid gap-0 md:grid-cols-[220px_1fr]">
        {/* Drive nav rail */}
        <aside className="border-b border-[#17231d]/10 bg-[#f3f0e8] p-4 md:border-b-0 md:border-r">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#173f33] text-xs font-bold text-[#d7ff79]">
              F
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">FDC Drive</p>
              <p className="text-[10px] text-[#17231d]/45">Company files</p>
            </div>
          </div>
          <nav className="space-y-0.5">
            <FolderButton
              label="All files"
              count={documents.length}
              active={folder === "All files"}
              onClick={() => setFolder("All files")}
            />
            {folders.map((entry) => (
              <FolderButton
                key={entry.name}
                label={entry.name}
                count={entry.count}
                active={folder === entry.name}
                onClick={() => setFolder(entry.name)}
              />
            ))}
          </nav>
        </aside>

        {/* Main file area */}
        <section className="min-w-0 p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[#17231d]/55">
              <span className="font-medium text-[#17231d]">My Drive</span>
              <span className="px-1.5 text-[#17231d]/30">›</span>
              {folder}
            </p>
            <label className="relative block w-full sm:w-64">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#17231d]/35">
                ⌕
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search in Drive"
                className="w-full rounded-full border border-[#17231d]/15 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-[#173f33]/40"
              />
            </label>
          </div>

          {visible.length === 0 ? (
            <p className="py-16 text-center text-sm text-[#17231d]/45">No files match “{query}”.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((doc) => (
                <button
                  key={doc.fileName}
                  onClick={() => setOpenDoc(doc)}
                  className="group flex flex-col rounded-xl border border-[#17231d]/10 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[#173f33]/30 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <PdfGlyph className="h-8 w-10" />
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider ${
                        categoryColor[doc.category] ?? "bg-stone-200 text-stone-700"
                      }`}
                    >
                      {doc.category}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm font-semibold leading-snug group-hover:text-[#173f33]">
                    {doc.fileName}
                  </p>
                  <p className="mt-1.5 line-clamp-2 flex-1 text-xs leading-5 text-[#17231d]/55">
                    {doc.summary}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-[#17231d]/8 pt-2 text-[10px] text-[#17231d]/45">
                    <span className="truncate">{doc.owner}</span>
                    <span className="shrink-0">{doc.pages.length} pages</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {openDoc && <FilePreview document={openDoc} onClose={() => setOpenDoc(null)} />}
    </div>
  );
}

function FolderButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
        active ? "bg-[#173f33] text-white" : "text-[#17231d]/75 hover:bg-[#17231d]/5"
      }`}
    >
      <span className="flex items-center gap-2">
        <span className={active ? "text-[#d7ff79]" : "text-[#17231d]/40"}>▸</span>
        {label}
      </span>
      <span className={`text-[10px] ${active ? "text-white/60" : "text-[#17231d]/35"}`}>{count}</span>
    </button>
  );
}
