# /data — demo corpus (gitignored)

Drop the documents Paige retrieves from here. Company folders are supported:

    data/
      acme/
        annual-report.pdf
        incident-log.pdf
      another-company/
        handbook.pdf

Then run:

    bun run ingest --company=acme

If only one company folder exists, `bun run ingest` auto-detects it. If multiple
company folders exist, `--company=<folder>` is required so one company's data
cannot leak into another company's answers.

For the built-in synthetic FDC demo company:

    bun run demo:seed

That command regenerates `data/fdc/*.pdf`, copies the same demo-safe PDFs to
`public/demo-company/fdc/`, parses the corpus with Unsiloed, and synchronizes
the page-cited chunks to Moss.

## What to put here

- **For building/testing:** synthetic quarterly reports + financial spreadsheets
  (the set your friend generates — varied currencies, fiscal years, and layouts, so
  the parse + retrieval is stress-tested across formats).
- **For the stage demo:** a real public company's last ~10 years of annual reports /
  10-Ks. Real numbers impress judges. Avoid scanned-image-only PDFs — Unsiloed needs
  text/tables it can actually parse.

General source PDFs are gitignored because they may be large or confidential. The
synthetic FDC copies under `public/demo-company/fdc/` are tracked so judges can open
the exact demo PDFs; the generator and structured source data remain reproducible.
