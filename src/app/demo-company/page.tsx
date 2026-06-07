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
    <div className="min-h-screen bg-[#f3f0e8] text-[#17231d]">
      <header className="sticky top-0 z-10 border-b border-[#17231d]/10 bg-[#f8f6f0]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Paige
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-[#17231d]/50 sm:inline">
              Synthetic demo workspace
            </span>
            <Link
              href="/room"
              className="rounded-full bg-[#173f33] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#235746]"
            >
              Ask Paige
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#d7ff79] px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#173f33]">
              Demo company
            </span>
            <span className="rounded-full border border-[#17231d]/15 px-3 py-1 text-xs text-[#17231d]/60">
              All data is fictional
            </span>
          </div>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {fdcCompany.legalName}
          </h1>
          <p className="mt-3 max-w-3xl text-balance leading-7 text-[#17231d]/65">
            {fdcCompany.description} These files are parsed by Unsiloed and indexed in Moss — open any
            one to read what Paige retrieves and cites live in the meeting.
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
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#17231d]/40">
                  {label}
                </p>
                <p className="mt-0.5 font-medium">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <DriveExplorer documents={fdcDocuments} />

        <section className="mt-10 rounded-2xl bg-[#d7ff79] px-6 py-8 sm:px-10">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#173f33]/60">
                Live demo prompts
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                Ask the company, not the folder.
              </h2>
              <p className="mt-3 max-w-md leading-7 text-[#173f33]/70">
                Open the meeting room, say “Paige,” and ask one of these. She speaks a cited answer,
                shares her screen with the chart, then drops in a generated visual.
              </p>
              <Link
                href="/room"
                className="mt-5 inline-flex rounded-full bg-[#173f33] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#235746]"
              >
                Enter the meeting room
              </Link>
            </div>
            <ol className="grid gap-2 sm:grid-cols-2">
              {fdcQuestions.map((question, index) => (
                <li
                  key={question}
                  className="rounded-xl border border-[#173f33]/10 bg-white/55 p-4 text-sm font-medium leading-6"
                >
                  <span className="mr-2 font-mono text-xs text-[#173f33]/45">
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
