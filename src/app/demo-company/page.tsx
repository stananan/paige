import type { Metadata } from "next";
import Link from "next/link";
import { fdcCompany, fdcDocuments, fdcQuestions } from "@/data/fdc";
import DriveExplorer from "./DriveExplorer";

export const metadata: Metadata = {
  title: "FDC Company Drive | Paige",
  description: "Browse the fictional FDC company files Paige retrieves from during the demo.",
};

export default function DemoCompanyPage() {
  return (
    <div className="min-h-screen bg-[#f1f6ff] text-foreground">
      <header className="sticky top-0 z-10 border-b border-foreground/10 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Paige
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-muted sm:inline">
              Synthetic demo workspace
            </span>
            <Link
              href="/room"
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-strong"
            >
              Ask Paige
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-accent/10 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
              Demo company
            </span>
            <span className="rounded-full border border-foreground/15 px-3 py-1 text-xs text-foreground/60">
              All data is fictional
            </span>
          </div>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {fdcCompany.legalName}
          </h1>
          <p className="mt-3 max-w-3xl text-balance leading-7 text-foreground/65">
            {fdcCompany.description} Every file below is a real generated PDF from the
            <code className="mx-1 rounded bg-foreground/5 px-1.5 py-0.5 text-sm">data/fdc</code>
            corpus, parsed by Unsiloed and indexed in Moss for Paige to retrieve and cite.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            {[
              ["Founded", fdcCompany.founded],
              ["Headquarters", fdcCompany.headquarters],
              ["Employees", String(fdcCompany.employees)],
              ["Customers", String(fdcCompany.customers)],
              ["Stage", fdcCompany.stage],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="font-mono text-[10px] uppercase tracking-wider text-foreground/40">
                  {label}
                </p>
                <p className="mt-0.5 font-medium">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <DriveExplorer documents={fdcDocuments} />

        <section className="mt-10 overflow-hidden rounded-2xl bg-gradient-to-br from-accent to-accent-strong px-6 py-8 text-white shadow-lg shadow-accent/20 sm:px-10">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                Live demo prompts
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                Ask the company, not the folder.
              </h2>
              <p className="mt-3 max-w-md leading-7 text-white/80">
                Open the meeting room, hold Space, and ask one of these. Release to send; she speaks a cited answer,
                then renders an exact chart directly from the retrieved PDF values when the question
                asks for a comparison.
              </p>
              <Link
                href="/room"
                className="mt-5 inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-accent transition hover:bg-white/90"
              >
                Enter the meeting room
              </Link>
            </div>
            <ol className="grid gap-2 sm:grid-cols-2">
              {fdcQuestions.map((question, index) => (
                <li
                  key={question}
                  className="rounded-xl border border-white/15 bg-white/10 p-4 text-sm font-medium leading-6 backdrop-blur-sm"
                >
                  <span className="mr-2 font-mono text-xs text-white/55">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {question}
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
    </div>
  );
}
