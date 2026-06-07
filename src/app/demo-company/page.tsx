import type { Metadata } from "next";
import Link from "next/link";
import {
  fdcAccounts,
  fdcCompany,
  fdcDocuments,
  fdcFinancials,
  fdcIncidents,
  fdcMetrics,
  fdcQuestions,
} from "@/data/fdc";

export const metadata: Metadata = {
  title: "FDC Demo Company | Paige",
  description: "Explore the fictional company dataset prepared for the Paige live demo.",
};

const categoryStyles: Record<string, string> = {
  Strategy: "bg-violet-100 text-violet-800",
  Finance: "bg-emerald-100 text-emerald-800",
  Revenue: "bg-blue-100 text-blue-800",
  Product: "bg-amber-100 text-amber-800",
  Operations: "bg-orange-100 text-orange-800",
  People: "bg-pink-100 text-pink-800",
  Security: "bg-slate-200 text-slate-800",
  Support: "bg-cyan-100 text-cyan-800",
};

export default function DemoCompanyPage() {
  const maxRevenue = Math.max(...fdcFinancials.map((year) => year.revenue));

  return (
    <div className="min-h-screen bg-[#f3f0e8] text-[#17231d]">
      <header className="border-b border-[#17231d]/10 bg-[#f8f6f0]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
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

      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <section className="overflow-hidden rounded-[2rem] bg-[#173f33] text-white shadow-[0_24px_80px_rgba(23,63,51,0.18)]">
          <div className="grid gap-10 px-6 py-8 sm:px-10 sm:py-12 lg:grid-cols-[1.4fr_0.8fr] lg:px-14">
            <div>
              <div className="mb-6 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#d7ff79] px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#173f33]">
                  Demo company
                </span>
                <span className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70">
                  All data is fictional
                </span>
              </div>
              <p className="font-mono text-sm uppercase tracking-[0.2em] text-[#d7ff79]">
                {fdcCompany.legalName}
              </p>
              <h1 className="mt-3 text-5xl font-semibold tracking-[-0.05em] sm:text-7xl">
                FDC
              </h1>
              <p className="mt-5 max-w-3xl text-balance text-lg leading-8 text-white/78 sm:text-xl">
                {fdcCompany.description}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/15 bg-white/15">
              {[
                ["Founded", fdcCompany.founded],
                ["Headquarters", fdcCompany.headquarters],
                ["Employees", fdcCompany.employees.toString()],
                ["Customers", fdcCompany.customers.toString()],
              ].map(([label, value]) => (
                <div key={label} className="bg-[#173f33] p-4 sm:p-5">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-white/45">
                    {label}
                  </p>
                  <p className="mt-2 text-sm font-medium leading-snug text-white sm:text-base">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="company-pulse" className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="section-kicker">Current quarter</p>
              <h2 id="company-pulse" className="section-title">
                Company pulse
              </h2>
            </div>
            <p className="hidden text-sm text-[#17231d]/50 sm:block">As of March 31, 2026</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {fdcMetrics.map((metric) => (
              <article key={metric.label} className="dashboard-card p-5">
                <p className="text-sm text-[#17231d]/55">{metric.label}</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{metric.value}</p>
                <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#17231d]/10 pt-3 text-xs">
                  <span className="text-[#17231d]/50">{metric.detail}</span>
                  <span className="font-medium text-[#27705a]">{metric.trend}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <article className="dashboard-card overflow-hidden">
            <div className="border-b border-[#17231d]/10 p-5 sm:p-6">
              <p className="section-kicker">Financial history</p>
              <h2 className="section-title">Growth with improving economics</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-[#173f33]/[0.035] font-mono text-[10px] uppercase tracking-wider text-[#17231d]/50">
                  <tr>
                    <th className="px-6 py-3 font-medium">Fiscal year</th>
                    <th className="px-4 py-3 font-medium">Revenue</th>
                    <th className="px-4 py-3 font-medium">Exit ARR</th>
                    <th className="px-4 py-3 font-medium">Gross margin</th>
                    <th className="px-4 py-3 font-medium">Operating income</th>
                    <th className="px-6 py-3 font-medium">NRR</th>
                  </tr>
                </thead>
                <tbody>
                  {fdcFinancials.map((year) => (
                    <tr key={year.year} className="border-t border-[#17231d]/8">
                      <td className="px-6 py-4 font-semibold">{year.year}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <span className="w-12 tabular-nums">${year.revenue}M</span>
                          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[#173f33]/10">
                            <span
                              className="block h-full rounded-full bg-[#4e9f7f]"
                              style={{ width: `${(year.revenue / maxRevenue) * 100}%` }}
                            />
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 tabular-nums">${year.arr}M</td>
                      <td className="px-4 py-4 tabular-nums">{year.grossMargin}%</td>
                      <td
                        className={`px-4 py-4 tabular-nums ${
                          year.operatingIncome >= 0 ? "text-[#27705a]" : "text-[#a4472f]"
                        }`}
                      >
                        {year.operatingIncome < 0 ? "-" : ""}$
                        {Math.abs(year.operatingIncome)}M
                      </td>
                      <td className="px-6 py-4 tabular-nums">{year.netRetention}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="dashboard-card p-5 sm:p-6">
            <p className="section-kicker">Operating brief</p>
            <h2 className="section-title">What matters now</h2>
            <div className="mt-6 space-y-5">
              {[
                ["Board target", "$100M ARR by Q4 2026"],
                ["Expansion", "Grow EMEA from 18% to 23% of revenue"],
                ["Product", "EU data residency ships in September"],
                ["Watch item", "$7.1M ARR across yellow accounts"],
              ].map(([label, value], index) => (
                <div key={label} className="flex gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#d7ff79] font-mono text-xs font-semibold">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-[#17231d]/45">
                      {label}
                    </p>
                    <p className="mt-1 text-sm font-medium leading-6">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section aria-labelledby="data-room" className="mt-12">
          <div className="mb-5 max-w-3xl">
            <p className="section-kicker">Indexed knowledge base</p>
            <h2 id="data-room" className="section-title">
              FDC data room
            </h2>
            <p className="mt-2 leading-7 text-[#17231d]/60">
              These synthetic records are generated as PDFs, parsed by Unsiloed, and indexed
              in Moss. Paige cites the source file and page when she answers.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {fdcDocuments.map((document) => (
              <article key={document.fileName} className="dashboard-card flex flex-col p-5">
                <div className="flex items-start justify-between gap-4">
                  <span
                    className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wider ${
                      categoryStyles[document.category] ?? "bg-stone-100 text-stone-800"
                    }`}
                  >
                    {document.category}
                  </span>
                  <span className="font-mono text-[10px] text-[#17231d]/35">
                    {document.pages.length} pages
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-[-0.02em]">{document.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-[#17231d]/58">
                  {document.summary}
                </p>
                <div className="mt-5 border-t border-[#17231d]/10 pt-3 text-xs text-[#17231d]/45">
                  <div className="flex justify-between gap-3">
                    <span>{document.owner}</span>
                    <span>{document.updated}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 grid gap-4 xl:grid-cols-2">
          <article className="dashboard-card overflow-hidden">
            <div className="border-b border-[#17231d]/10 p-5 sm:p-6">
              <p className="section-kicker">Customer book</p>
              <h2 className="section-title">Key accounts & renewals</h2>
            </div>
            <div className="divide-y divide-[#17231d]/8">
              {fdcAccounts.map((account) => (
                <div key={account.name} className="grid gap-3 p-5 sm:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{account.name}</h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                          account.health === "Green"
                            ? "bg-emerald-100 text-emerald-800"
                            : account.health === "Yellow"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {account.health}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-[#17231d]/55">{account.note}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-semibold tabular-nums">{account.arr}</p>
                    <p className="mt-1 text-xs text-[#17231d]/45">{account.renewal}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="dashboard-card overflow-hidden">
            <div className="border-b border-[#17231d]/10 p-5 sm:p-6">
              <p className="section-kicker">Reliability log</p>
              <h2 className="section-title">Recent incidents</h2>
            </div>
            <div className="divide-y divide-[#17231d]/8">
              {fdcIncidents.map((incident) => (
                <div key={`${incident.date}-${incident.title}`} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{incident.title}</h3>
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
                      <span className="rounded bg-orange-100 px-2 py-1 text-orange-800">
                        {incident.severity}
                      </span>
                      <span className="text-[#17231d]/40">{incident.duration}</span>
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#17231d]/58">{incident.impact}</p>
                  <p className="mt-2 text-sm leading-6">
                    <span className="font-medium text-[#27705a]">Fix:</span>{" "}
                    {incident.resolution}
                  </p>
                  <p className="mt-2 font-mono text-[10px] text-[#17231d]/35">{incident.date}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="mt-12 rounded-[2rem] bg-[#d7ff79] px-6 py-8 sm:px-10 sm:py-10">
          <div className="grid gap-8 lg:grid-cols-[0.65fr_1.35fr] lg:items-end">
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#173f33]/60">
                Live demo prompts
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                Ask the company, not the folder.
              </h2>
              <p className="mt-3 max-w-lg leading-7 text-[#173f33]/70">
                Open the meeting room, say “Paige,” and ask one of these questions. The
                answer should arrive with a chart or source citation.
              </p>
              <Link
                href="/room"
                className="mt-6 inline-flex rounded-full bg-[#173f33] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#235746]"
              >
                Enter the meeting room
              </Link>
            </div>
            <ol className="grid gap-2 sm:grid-cols-2">
              {fdcQuestions.map((question, index) => (
                <li
                  key={question}
                  className="rounded-xl border border-[#173f33]/10 bg-white/50 p-4 text-sm font-medium leading-6"
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

