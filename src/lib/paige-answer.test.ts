import { describe, expect, test } from "bun:test";
import {
  askPaige,
  extractGroundedTableChart,
  generateAnswerFromDocuments,
  generateConversationalAnswer,
  parseModelAnswer,
  retrievalQueryForQuestion,
  retrieveMossDocuments,
  shouldRetrieveCompanyDocuments,
  type RetrievedDocument,
} from "./paige-answer";
import { fdcDocuments } from "../data/fdc";

const documents: RetrievedDocument[] = [
  {
    sourceFile: "annual-report.pdf",
    page: "7",
    text: "2023 revenue was $120 million. 2024 revenue was $150 million.",
  },
  {
    sourceFile: "annual-report.pdf",
    page: "8",
    text: "2025 revenue was $210 million, up 40 percent from 2024.",
  },
];

const mossEnvironment = {
  MOSS_PROJECT_ID: "project-id",
  MOSS_PROJECT_KEY: "project-key",
  MOSS_INDEX: "company-docs",
};

const q3History: RetrievedDocument = {
  sourceFile: "quarterly-history.pdf",
  page: "1",
  text: [
    "All currency values are in USD millions unless otherwise stated.",
    "PERIOD | REVENUE | OPERATING INCOME | GROSS MARGIN",
    "Q3 2022 | 4.6 | -2.0 | 60%",
    "Q3 2023 | 7.9 | -1.4 | 65%",
    "Q3 2024 | 12.4 | -0.3 | 70%",
    "Q3 2025 | 17.2 | 1.3 | 74%",
  ].join("\n"),
};

const q2Documents: RetrievedDocument[] = [
  {
    sourceFile: "fdc/FDC Q2 2025 Quarterly Report.pdf",
    sourceUrl: "/demo-company/fdc/FDC%20Q2%202025%20Quarterly%20Report.pdf#page=1",
    page: "1",
    text: [
      "REPORT STATUS: Actual.",
      "All currency values are in USD millions unless otherwise stated.",
      "PERIOD | REVENUE | EXIT ARR | GROSS MARGIN | OPERATING INCOME",
      "Q2 2025 actual | 16.8 | 69.1 | 74% | 1.1",
      "PERIOD | OPERATING CASH FLOW | NRR | CUSTOMERS | EMPLOYEES",
      "Q2 2025 actual | 1.5 | 120% | 401 | 262",
    ].join("\n"),
  },
  {
    sourceFile: "fdc/FDC Q2 2026 Quarterly Report.pdf",
    sourceUrl:
      "/demo-company/fdc/FDC%20Q2%202026%20Quarterly%20Report.pdf#page=1",
    page: "1",
    text: [
      "REPORT STATUS: Preliminary forecast.",
      "All currency values are in USD millions unless otherwise stated.",
      "PERIOD | REVENUE | EXIT ARR | GROSS MARGIN | OPERATING INCOME",
      "Q2 2026 forecast | 21.6 | 89.2 | 77% | 2.7",
      "PERIOD | OPERATING CASH FLOW | NRR | CUSTOMERS | EMPLOYEES",
      "Q2 2026 forecast | 3.1 | 124% | 447 | 298",
    ].join("\n"),
  },
];

const lastYearQuarterDocuments: RetrievedDocument[] = [
  {
    sourceFile: "fdc/FDC Q1 2025 Quarterly Report.pdf",
    page: "1",
    text: "All currency values are in USD millions.\nPERIOD | REVENUE\nQ1 2025 actual | 16.0",
  },
  q2Documents[0],
  {
    sourceFile: "fdc/FDC Q3 2025 Quarterly Report.pdf",
    page: "1",
    text: "All currency values are in USD millions.\nPERIOD | REVENUE\nQ3 2025 actual | 17.2",
  },
  {
    sourceFile: "fdc/FDC Q4 2025 Quarterly Report.pdf",
    page: "1",
    text: "All currency values are in USD millions.\nPERIOD | REVENUE\nQ4 2025 actual | 18.4",
  },
];

function asMossDocument(document: RetrievedDocument) {
  return {
    id: `${document.sourceFile}-${document.page}`,
    text: document.text,
    metadata: {
      sourceFile: document.sourceFile,
      page: document.page,
      ...(document.sourceUrl ? { sourceUrl: document.sourceUrl } : {}),
    },
  };
}

describe("retrieveMossDocuments", () => {
  test("uses Moss semantic cloud query results when available", async () => {
    const requests: string[] = [];
    const results = await retrieveMossDocuments("2025 revenue", {
      environment: mossEnvironment,
      fetchImpl: async (input, init) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith("/identity/auth/token")) {
          return Response.json({ token: "moss-token", expiresIn: 300 }, { status: 201 });
        }
        expect(init?.headers).toEqual({
          Authorization: "Bearer moss-token",
          "Content-Type": "application/json",
        });
        return Response.json({
          docs: [asMossDocument(documents[1])],
          query: "2025 revenue",
        });
      },
    });

    expect(requests).toHaveLength(2);
    expect(results).toEqual([documents[1]]);
  });

  test("adds lexically relevant pages when semantic results select an adjacent page", async () => {
    const adjacent: RetrievedDocument = {
      sourceFile: "sales-pipeline.pdf",
      page: "2",
      text: "Customer renewal health and adoption notes.",
    };
    const exact: RetrievedDocument = {
      sourceFile: "sales-pipeline.pdf",
      page: "1",
      text: "Q2 sales opportunities and weighted pipeline values.",
    };

    const results = await retrieveMossDocuments("largest Q2 sales opportunities", {
      environment: mossEnvironment,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/identity/auth/token")) {
          return Response.json({ token: "moss-token", expiresIn: 300 }, { status: 201 });
        }
        if (url.endsWith("/query")) {
          return Response.json({ docs: [asMossDocument(adjacent)] });
        }
        return Response.json([asMossDocument(adjacent), asMossDocument(exact)]);
      },
    });

    expect(results).toEqual([exact, adjacent]);
  });

  test("does not let zero-score lexical documents evict semantic results", async () => {
    const semantic = Array.from({ length: 5 }, (_, index) => ({
      sourceFile: "strategy.pdf",
      page: String(index + 1),
      text: `Semantically relevant result ${index + 1}.`,
    }));
    const unrelated = Array.from({ length: 5 }, (_, index) => ({
      sourceFile: `unrelated-${index + 1}.pdf`,
      page: "1",
      text: "Vacation policy and office snacks.",
    }));

    const results = await retrieveMossDocuments("profitability trajectory", {
      environment: mossEnvironment,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/identity/auth/token")) {
          return Response.json({ token: "moss-token" }, { status: 201 });
        }
        if (url.endsWith("/query")) {
          return Response.json({ docs: semantic.map(asMossDocument) });
        }
        return Response.json(unrelated.map(asMossDocument));
      },
    });

    expect(results).toEqual(semantic);
  });

  test("falls back to ranked Moss getDocs results when cloud query is unavailable", async () => {
    const unrelated: RetrievedDocument = {
      sourceFile: "benefits.pdf",
      page: "2",
      text: "Employees receive twenty vacation days.",
    };
    const requests: string[] = [];
    const results = await retrieveMossDocuments("What was revenue in 2025?", {
      environment: mossEnvironment,
      fetchImpl: async (input, init) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith("/identity/auth/token")) {
          return Response.json({ token: "moss-token", expiresIn: 300 }, { status: 201 });
        }
        if (url.endsWith("/query")) {
          return new Response("Unavailable", { status: 503 });
        }
        expect(init?.headers).toEqual({
          "Content-Type": "application/json",
          "x-project-key": "project-key",
        });
        expect(JSON.parse(String(init?.body))).toEqual({
          action: "getDocs",
          projectId: "project-id",
          indexName: "company-docs",
        });
        return Response.json([asMossDocument(unrelated), asMossDocument(documents[1])]);
      },
    });

    expect(requests).toHaveLength(3);
    expect(results[0]).toEqual(documents[1]);
  });

  test("keeps evidence from both requested years for a comparison", async () => {
    const results = await retrieveMossDocuments(
      "Q2 revenue comparison\nRetrieval periods: Q2 2026 and Q2 2025.",
      {
        environment: mossEnvironment,
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.endsWith("/identity/auth/token")) {
            return Response.json({ token: "moss-token" }, { status: 201 });
          }
          if (url.endsWith("/query")) {
            return Response.json({ docs: [asMossDocument(q2Documents[1])] });
          }
          return Response.json(q2Documents.map(asMossDocument));
        },
      },
    );

    expect(results.map((document) => document.sourceFile)).toEqual([
      q2Documents[1].sourceFile,
      q2Documents[0].sourceFile,
    ]);
  });

  test("selects every requested quarterly scorecard for a broad year query", async () => {
    const question = retrievalQueryForQuestion(
      "Give me a visual of the reports last year.",
    );
    const results = await retrieveMossDocuments(question, {
      environment: mossEnvironment,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/identity/auth/token")) {
          return Response.json({ token: "moss-token" }, { status: 201 });
        }
        if (url.endsWith("/query")) {
          return Response.json({
            docs: [asMossDocument(lastYearQuarterDocuments[3])],
          });
        }
        return Response.json(lastYearQuarterDocuments.map(asMossDocument));
      },
    });

    expect(results.slice(0, 4).map((document) => document.sourceFile)).toEqual(
      lastYearQuarterDocuments.map((document) => document.sourceFile),
    );
  });
});

describe("parseModelAnswer", () => {
  test("maps model citation indexes to retrieved source metadata", () => {
    expect(
      parseModelAnswer(
        {
          answer: "Revenue rose from $120 million in 2023 to $210 million in 2025.",
          citations: [1, 2, 2],
          chart: {
            title: "Revenue",
            labels: ["2023", "2024", "2025"],
            values: [120, 150, 210],
            unit: "USD millions",
          },
        },
        documents,
        "test-model",
      ),
    ).toEqual({
      answer: "Revenue rose from $120 million in 2023 to $210 million in 2025.",
      citations: [
        { sourceFile: "annual-report.pdf", page: "7" },
        { sourceFile: "annual-report.pdf", page: "8" },
      ],
      chart: {
        title: "Revenue",
        labels: ["2023", "2024", "2025"],
        values: [120, 150, 210],
        unit: "USD millions",
      },
      model: "test-model",
    });
  });

  test("preserves a safe public PDF link on a citation", () => {
    const linkedDocuments: RetrievedDocument[] = [
      {
        ...documents[1],
        sourceUrl: "/demo-company/fdc/annual-report.pdf#page=8",
      },
    ];
    const answer = parseModelAnswer(
      {
        answer: "Revenue reached $210 million in 2025.",
        citations: [1],
        chart: null,
      },
      linkedDocuments,
      "test-model",
    );

    expect(answer.citations).toEqual([
      {
        sourceFile: "annual-report.pdf",
        page: "8",
        url: "/demo-company/fdc/annual-report.pdf#page=8",
      },
    ]);
  });

  test("drops charts containing values absent from cited source text", () => {
    const answer = parseModelAnswer(
      {
        answer: "Revenue increased.",
        citations: [1],
        chart: {
          title: "Revenue",
          labels: ["2023", "2024"],
          values: [120, 999],
          unit: "USD millions",
        },
      },
      documents,
      "test-model",
    );

    expect(answer.chart).toBeNull();
  });

  test("drops charts that change source units", () => {
    const answer = parseModelAnswer(
      {
        answer: "Revenue increased.",
        citations: [1],
        chart: {
          title: "Revenue",
          labels: ["2023", "2024"],
          values: [120, 150],
          unit: "USD billions",
        },
      },
      documents,
      "test-model",
    );

    expect(answer.chart).toBeNull();
  });

  test("drops charts that swap source labels and values", () => {
    const answer = parseModelAnswer(
      {
        answer: "Revenue increased.",
        citations: [1],
        chart: {
          title: "Revenue",
          labels: ["2023", "2024"],
          values: [150, 120],
          unit: "USD millions",
        },
      },
      documents,
      "test-model",
    );

    expect(answer.chart).toBeNull();
  });

  test("rejects citation indexes outside retrieved results", () => {
    expect(() =>
      parseModelAnswer(
        { answer: "Unsupported", citations: [3], chart: null },
        documents,
        "test-model",
      ),
    ).toThrow("invalid citations");
  });

  test("refuses unsupported numeric claims in the spoken answer", () => {
    expect(() =>
      parseModelAnswer(
        {
          answer: "Revenue reached $999 million in 2025.",
          citations: [2],
          chart: null,
        },
        documents,
        "test-model",
      ),
    ).toThrow("numbers absent from cited sources");
  });

  test("refuses numeric claims that change source units", () => {
    expect(() =>
      parseModelAnswer(
        {
          answer: "Revenue reached $120 billion in 2023.",
          citations: [1],
          chart: null,
        },
        documents,
        "test-model",
      ),
    ).toThrow("numbers absent from cited sources");
  });

  test("accepts answer numbers whose unit is declared once for the document", () => {
    const tableDocs: RetrievedDocument[] = [
      {
        sourceFile: "annual.pdf",
        page: "1",
        text: "All currency values are in USD millions.\nFY2022 | 18.4\nFY2025 | 68.4",
      },
    ];

    const answer = parseModelAnswer(
      {
        answer: "Revenue grew from $18.4 million in FY2022 to $68.4 million in FY2025.",
        citations: [1],
        chart: null,
      },
      tableDocs,
      "test-model",
    );

    expect(answer.citations).toEqual([{ sourceFile: "annual.pdf", page: "1" }]);
  });

  test("turns uncited output into an explicit no-results answer", () => {
    const answer = parseModelAnswer(
      {
        answer: "Revenue increased.",
        citations: [],
        chart: null,
      },
      documents,
      "test-model",
    );

    expect(answer.answer).toContain("couldn't find");
    expect(answer.citations).toEqual([]);
  });
});

describe("extractGroundedTableChart", () => {
  test("builds a Q3 revenue chart directly from a cited PDF table", () => {
    const extracted = extractGroundedTableChart(
      "Compare Q3 revenue from 2022 through 2025",
      [q3History],
    );

    expect(extracted).toEqual({
      chart: {
        title: "REVENUE — Q3 history",
        labels: ["Q3 2022", "Q3 2023", "Q3 2024", "Q3 2025"],
        values: [4.6, 7.9, 12.4, 17.2],
        unit: "USD millions",
      },
      sources: [q3History],
    });
  });

  test("builds a Q2 comparison chart from two separately cited reports", () => {
    expect(
      extractGroundedTableChart(
        "Create a graph comparing Q2 revenue this year and last year",
        q2Documents,
      ),
    ).toEqual({
      chart: {
        title: "REVENUE — Q2 comparison",
        labels: ["Q2 2025 actual", "Q2 2026 forecast"],
        values: [16.8, 21.6],
        unit: "USD millions",
      },
      sources: q2Documents,
    });
  });

  test("defaults a yearless comparison of both Q2 reports to revenue", () => {
    expect(
      extractGroundedTableChart(
        "Can you compare both Q2 reports and make a visual?",
        q2Documents,
      ),
    ).toEqual({
      chart: {
        title: "REVENUE — Q2 comparison",
        labels: ["Q2 2025 actual", "Q2 2026 forecast"],
        values: [16.8, 21.6],
        unit: "USD millions",
      },
      sources: q2Documents,
    });
  });

  test("returns no chart when the question does not name a table metric", () => {
    expect(extractGroundedTableChart("Compare the last several years", [q3History])).toBeNull();
  });

  test("defaults a visual of quarterly reports to revenue", () => {
    expect(
      extractGroundedTableChart(
        "Give me a visual of the reports last year.",
        lastYearQuarterDocuments,
      )?.chart,
    ).toEqual({
      title: "REVENUE",
      labels: [
        "Q1 2025 actual",
        "Q2 2025 actual",
        "Q3 2025 actual",
        "Q4 2025 actual",
      ],
      values: [16, 16.8, 17.2, 18.4],
      unit: "USD millions",
    });
  });
});

describe("generateAnswerFromDocuments", () => {
  test("calls TrueFoundry with grounded context and validates the response", async () => {
    const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      expect(request.model).toBe("openai/gpt-5.4-mini");
      expect(request.reasoning_effort).toBe("none");
      expect(request.messages[1].content).toContain("[1] annual-report.pdf, page 7");

      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: "Revenue reached $210 million in 2025.",
                citations: [2],
                chart: null,
              }),
            },
          },
        ],
      });
    };

    const answer = await generateAnswerFromDocuments("What was 2025 revenue?", documents, {
      fetchImpl,
      environment: {
        TRUEFOUNDRY_BASE_URL: "https://gateway.truefoundry.ai",
        TRUEFOUNDRY_API_KEY: "test-key",
        TRUEFOUNDRY_MODEL: "openai/gpt-5.4-mini",
      },
    });

    expect(answer.answer).toBe("Revenue reached $210 million in 2025.");
    expect(answer.citations).toEqual([{ sourceFile: "annual-report.pdf", page: "8" }]);
  });

  test("returns a grounded no-results response without calling the model", async () => {
    let called = false;
    const answer = await generateAnswerFromDocuments("Unknown?", [], {
      fetchImpl: async () => {
        called = true;
        return Response.json({});
      },
      environment: {
        TRUEFOUNDRY_BASE_URL: "https://gateway.truefoundry.ai",
        TRUEFOUNDRY_API_KEY: "test-key",
      },
    });

    expect(called).toBe(false);
    expect(answer.citations).toEqual([]);
    expect(answer.chart).toBeNull();
  });

  test("requires a chart in the schema for comparison questions", async () => {
    const answer = await generateAnswerFromDocuments("Compare revenue by year", documents, {
      fetchImpl: async (_input, init) => {
        const request = JSON.parse(String(init?.body));
        const chartSchema =
          request.response_format.json_schema.schema.properties.chart;
        expect(chartSchema.type).toBe("object");

        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "Revenue rose from $120 million in 2023 to $210 million in 2025.",
                  citations: [1, 2],
                  chart: {
                    title: "Revenue",
                    labels: ["2023", "2024", "2025"],
                    values: [120, 150, 210],
                    unit: "USD millions",
                  },
                }),
              },
            },
          ],
        });
      },
      environment: {
        TRUEFOUNDRY_BASE_URL: "https://gateway.truefoundry.ai",
        TRUEFOUNDRY_API_KEY: "test-key",
      },
    });

    expect(answer.chart?.values).toEqual([120, 150, 210]);
  });

  test("does not force a numeric chart for a grounded nonnumeric image", async () => {
    const securityDocument: RetrievedDocument = {
      sourceFile: "security-review.pdf",
      page: "2",
      text: "The largest gap is incomplete vendor access recertification.",
    };
    const answer = await generateAnswerFromDocuments(
      "Create an image of our biggest security gap.",
      [securityDocument],
      {
        fetchImpl: async (_input, init) => {
          const request = JSON.parse(String(init?.body));
          const chartSchema =
            request.response_format.json_schema.schema.properties.chart;
          expect(chartSchema.anyOf).toBeArray();

          return Response.json({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer: "The biggest gap is incomplete vendor access recertification.",
                    citations: [1],
                    chart: null,
                  }),
                },
              },
            ],
          });
        },
        environment: {
          TRUEFOUNDRY_BASE_URL: "https://gateway.truefoundry.ai",
          TRUEFOUNDRY_API_KEY: "test-key",
        },
      },
    );

    expect(answer.citations).toEqual([
      { sourceFile: "security-review.pdf", page: "2" },
    ]);
    expect(answer.chart).toBeNull();
  });

  test("falls back to a deterministic source-table chart when the model omits one", async () => {
    const answer = await generateAnswerFromDocuments(
      "Compare Q3 revenue from 2022 through 2025",
      [q3History],
      {
        fetchImpl: async () =>
          Response.json({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer: "Q3 revenue rose from $4.6 million in 2022 to $17.2 million in 2025.",
                    citations: [1],
                    chart: null,
                  }),
                },
              },
            ],
          }),
        environment: {
          TRUEFOUNDRY_BASE_URL: "https://gateway.truefoundry.ai",
          TRUEFOUNDRY_API_KEY: "test-key",
        },
      },
    );

    expect(answer.chart).toEqual({
      title: "REVENUE — Q3 history",
      labels: ["Q3 2022", "Q3 2023", "Q3 2024", "Q3 2025"],
      values: [4.6, 7.9, 12.4, 17.2],
      unit: "USD millions",
    });
    expect(answer.citations).toEqual([{ sourceFile: "quarterly-history.pdf", page: "1" }]);
  });

  test("returns a deterministic cited Q2 summary when the model omits citations", async () => {
    const answer = await generateAnswerFromDocuments(
      "What are the key statistics in our latest Q2 report?",
      [q2Documents[1]],
      {
        fetchImpl: async () =>
          Response.json({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer: "I could not find it.",
                    citations: [],
                    chart: null,
                  }),
                },
              },
            ],
          }),
        environment: {
          TRUEFOUNDRY_BASE_URL: "https://gateway.truefoundry.ai",
          TRUEFOUNDRY_API_KEY: "test-key",
        },
      },
    );

    expect(answer.answer).toContain("$21.6 million in revenue");
    expect(answer.answer).toContain("preliminary forecast");
    expect(answer.citations).toEqual([
      {
        sourceFile: q2Documents[1].sourceFile,
        page: "1",
        url: q2Documents[1].sourceUrl,
      },
    ]);
  });

  test("answers quarter names and relative years from the exact scorecard", async () => {
    let modelCalled = false;
    const answer = await generateAnswerFromDocuments(
      "What was quarter 2 revenue last year?",
      [q2Documents[0]],
      {
        fetchImpl: async () => {
          modelCalled = true;
          return Response.json({});
        },
        environment: {
          TRUEFOUNDRY_BASE_URL: "https://gateway.truefoundry.ai",
          TRUEFOUNDRY_API_KEY: "test-key",
        },
      },
    );

    expect(modelCalled).toBe(false);
    expect(answer.answer).toBe(
      "FDC reported $16.8 million in revenue for Q2 2025.",
    );
    expect(answer.citations[0]?.sourceFile).toBe(
      "fdc/FDC Q2 2025 Quarterly Report.pdf",
    );
  });

  test("extracts grounded data when the user asks for an image instead of a graph", async () => {
    let modelCalled = false;
    const answer = await generateAnswerFromDocuments(
      "Create an image comparing Q2 revenue this year and last year.",
      q2Documents,
      {
        fetchImpl: async () => {
          modelCalled = true;
          return Response.json({});
        },
        environment: {
          TRUEFOUNDRY_BASE_URL: "https://gateway.truefoundry.ai",
          TRUEFOUNDRY_API_KEY: "test-key",
        },
      },
    );

    expect(modelCalled).toBe(false);
    expect(answer.chart).toEqual({
      title: "REVENUE — Q2 comparison",
      labels: ["Q2 2025 actual", "Q2 2026 forecast"],
      values: [16.8, 21.6],
      unit: "USD millions",
    });
    expect(answer.citations).toHaveLength(2);
  });

  test("lists all available quarterly reports for a relative year", async () => {
    const answer = await generateAnswerFromDocuments(
      "Show me all quarterly reports from last year.",
      lastYearQuarterDocuments,
      {
        fetchImpl: async () => Response.json({}),
        environment: {
          TRUEFOUNDRY_BASE_URL: "https://gateway.truefoundry.ai",
          TRUEFOUNDRY_API_KEY: "test-key",
        },
      },
    );

    expect(answer.answer).toContain("Q1 2025, Q2 2025, Q3 2025, Q4 2025");
    expect(answer.citations).toHaveLength(4);
  });

  test("forwards caller cancellation to the TrueFoundry request", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | null | undefined;

    const answer = await generateAnswerFromDocuments("What was 2025 revenue?", documents, {
      signal: controller.signal,
      fetchImpl: async (_input, init) => {
        requestSignal = init?.signal;
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "Revenue reached $210 million in 2025.",
                  citations: [2],
                  chart: null,
                }),
              },
            },
          ],
        });
      },
      environment: {
        TRUEFOUNDRY_BASE_URL: "https://gateway.truefoundry.ai",
        TRUEFOUNDRY_API_KEY: "test-key",
      },
    });

    expect(answer.citations).toHaveLength(1);
    expect(requestSignal).toBeInstanceOf(AbortSignal);
    controller.abort();
    expect(requestSignal?.aborted).toBe(true);
  });
});

const conversationEnvironment = {
  ...mossEnvironment,
  TRUEFOUNDRY_BASE_URL: "https://gateway.truefoundry.ai",
  TRUEFOUNDRY_API_KEY: "test-key",
  TRUEFOUNDRY_MODEL: "openai/gpt-5.4-mini",
};

describe("generateConversationalAnswer", () => {
  test("returns a spoken reply with no sources or chart", async () => {
    const answer = await generateConversationalAnswer("What is a good standup format?", {
      environment: conversationEnvironment,
      fetchImpl: async (input, init) => {
        expect(String(input)).toBe("https://gateway.truefoundry.ai/chat/completions");
        const request = JSON.parse(String(init?.body));
        expect(request.messages[0].content).toContain("live meeting copilot");
        expect(request.response_format).toBeUndefined();
        return Response.json({
          choices: [
            { message: { content: "Keep it to fifteen minutes: yesterday, today, blockers." } },
          ],
        });
      },
    });

    expect(answer.answer).toContain("fifteen minutes");
    expect(answer.citations).toEqual([]);
    expect(answer.chart).toBeNull();
  });

  test("falls back to a safe spoken line when the model call fails", async () => {
    const answer = await generateConversationalAnswer("hello", {
      environment: conversationEnvironment,
      fetchImpl: async () => new Response("nope", { status: 500 }),
    });

    expect(answer.answer).toContain("trouble reaching my tools");
    expect(answer.citations).toEqual([]);
    expect(answer.chart).toBeNull();
  });
});

describe("retrieval intent", () => {
  test("bypasses Moss for obvious conversation and keeps company questions grounded", () => {
    expect(shouldRetrieveCompanyDocuments("Hi Paige, can you introduce yourself?")).toBe(false);
    expect(shouldRetrieveCompanyDocuments("What's the weather like today?")).toBe(false);
    expect(
      shouldRetrieveCompanyDocuments("Draw a futuristic retail operations command center."),
    ).toBe(false);
    expect(shouldRetrieveCompanyDocuments("What are the key statistics in our Q2 report?")).toBe(
      true,
    );
    expect(
      shouldRetrieveCompanyDocuments("Draw a comparison of our Q2 revenue."),
    ).toBe(true);
  });

  test("expands relative demo periods without changing explicit years", () => {
    expect(
      retrievalQueryForQuestion("Create a graph comparing Q2 revenue this year and last year"),
    ).toContain("Q2 2026 and Q2 2025");
    expect(
      retrievalQueryForQuestion("Can you compare both Q2 reports and make a graph?"),
    ).toContain("Q2 2026 and Q2 2025");
    expect(retrievalQueryForQuestion("What was Q2 2025 revenue?")).toBe(
      "What was Q2 2025 revenue?",
    );
    expect(
      retrievalQueryForQuestion("What was quarter 2 revenue last year?"),
    ).toContain("Q2 2025");
    expect(
      retrievalQueryForQuestion("What was Q2 revenue last year?"),
    ).not.toContain("Q2 2026");
    expect(
      retrievalQueryForQuestion("Give me a visual of the reports last year."),
    ).toContain("Q1 2025 and Q2 2025 and Q3 2025 and Q4 2025");
  });
});

describe("FDC quarterly corpus", () => {
  test("uses the renamed Q2 report and includes estimated Q3 results", () => {
    expect(
      fdcDocuments.some(
        (document) => document.fileName === "FDC Q2 2026 Quarterly Report.pdf",
      ),
    ).toBe(true);
    expect(
      fdcDocuments.some((document) =>
        document.fileName.includes("Q2 2026 Preliminary"),
      ),
    ).toBe(false);
    expect(
      fdcDocuments.some(
        (document) => document.fileName === "FDC Estimated Q3 2026 Results.pdf",
      ),
    ).toBe(true);
  });
});

describe("askPaige conversational fallback", () => {
  test("acknowledges a creative image without calling Moss or the answer model", async () => {
    let called = false;
    const answer = await askPaige("Draw a futuristic retail operations command center.", {
      environment: conversationEnvironment,
      fetchImpl: async () => {
        called = true;
        throw new Error("Creative images should not call retrieval or the answer model");
      },
    });

    expect(called).toBe(false);
    expect(answer.answer).toContain("create that visual");
    expect(answer.citations).toEqual([]);
    expect(answer.chart).toBeNull();
  });

  test("answers obvious conversation without calling Moss", async () => {
    let mossCalled = false;
    const answer = await askPaige("Hi Paige, can you introduce yourself?", {
      environment: conversationEnvironment,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("service.usemoss.dev")) {
          mossCalled = true;
          throw new Error("Moss should not be called");
        }
        if (url.endsWith("/chat/completions")) {
          return Response.json({
            choices: [
              {
                message: {
                  content: "I'm Paige — I listen in and pull up cited answers when you need them.",
                },
              },
            ],
          });
        }
        throw new Error(`unexpected request: ${url}`);
      },
    });

    expect(answer.answer).toContain("Paige");
    expect(answer.citations).toEqual([]);
    expect(answer.chart).toBeNull();
    expect(mossCalled).toBe(false);
  });

  test("answers general questions without searching company documents", async () => {
    let mossCalled = false;
    const answer = await askPaige("What's the weather like today?", {
      environment: conversationEnvironment,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("service.usemoss.dev")) {
          mossCalled = true;
          throw new Error("Moss should not be called");
        }
        if (url.endsWith("/chat/completions")) {
          return Response.json({
            choices: [
              {
                message: {
                  content: "I don't have live weather data, but I can still help with the meeting.",
                },
              },
            ],
          });
        }
        throw new Error(`unexpected request: ${url}`);
      },
    });

    expect(answer.answer).toContain("weather");
    expect(answer.citations).toEqual([]);
    expect(answer.chart).toBeNull();
    expect(mossCalled).toBe(false);
  });

  test("still returns grounded answers when the documents support the question", async () => {
    const answer = await askPaige("What was 2025 revenue?", {
      environment: conversationEnvironment,
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (url.endsWith("/identity/auth/token")) {
          return Response.json({ token: "moss-token" }, { status: 201 });
        }
        if (url.endsWith("/query")) {
          return Response.json({ docs: [asMossDocument(documents[1])] });
        }
        if (url.endsWith("/chat/completions")) {
          const request = JSON.parse(String(init?.body));
          expect(String(request.messages[0].content)).toContain("Return JSON only");
          return Response.json({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer: "Revenue reached $210 million in 2025.",
                    citations: [1],
                    chart: null,
                  }),
                },
              },
            ],
          });
        }
        throw new Error(`unexpected request: ${url}`);
      },
    });

    expect(answer.answer).toContain("$210 million");
    expect(answer.citations).toEqual([{ sourceFile: "annual-report.pdf", page: "8" }]);
  });
});
