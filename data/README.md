# /data — demo corpus (gitignored)

Drop the documents Paige retrieves from here, then run:

    bun run ingest

## What to put here

- **For building/testing:** synthetic quarterly reports + financial spreadsheets
  (the set your friend generates — varied currencies, fiscal years, and layouts, so
  the parse + retrieval is stress-tested across formats).
- **For the stage demo:** a real public company's last ~10 years of annual reports /
  10-Ks. Real numbers impress judges. Avoid scanned-image-only PDFs — Unsiloed needs
  text/tables it can actually parse.

The files themselves are gitignored (large, possibly real filings); only this README
and `.gitignore` are tracked.
