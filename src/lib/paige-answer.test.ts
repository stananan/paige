import { describe, expect, test } from "bun:test";
import {
  askPaige,
  generateAnswerFromDocuments,
  generateConversationalAnswer,
  parseModelAnswer,
  retrieveMossDocuments,
  type RetrievedDocument,
} from "./paige-answer";

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

function asMossDocument(document: RetrievedDocument) {
  return {
    id: `${document.sourceFile}-${document.page}`,
    text: document.text,
    metadata: {
      sourceFile: document.sourceFile,
      page: document.page,
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

describe("askPaige conversational fallback", () => {
  test("answers conversationally when the index is unreachable", async () => {
    const answer = await askPaige("Hi Paige, can you introduce yourself?", {
      environment: conversationEnvironment,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("service.usemoss.dev")) {
          return new Response("Unavailable", { status: 503 });
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
  });

  test("answers conversationally when retrieved documents don't support the question", async () => {
    const answer = await askPaige("What's the weather like today?", {
      environment: conversationEnvironment,
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (url.endsWith("/identity/auth/token")) {
          return Response.json({ token: "moss-token" }, { status: 201 });
        }
        if (url.endsWith("/query")) {
          return Response.json({ docs: [asMossDocument(documents[0])] });
        }
        if (url.endsWith("/manage")) {
          return Response.json([]);
        }
        if (url.endsWith("/chat/completions")) {
          const request = JSON.parse(String(init?.body));
          if (String(request.messages[0].content).includes("Return JSON only")) {
            return Response.json({
              choices: [
                { message: { content: JSON.stringify({ answer: "n/a", citations: [], chart: null }) } },
              ],
            });
          }
          return Response.json({
            choices: [
              {
                message: {
                  content: "I don't see that in the indexed documents, but I can help another way.",
                },
              },
            ],
          });
        }
        throw new Error(`unexpected request: ${url}`);
      },
    });

    expect(answer.answer).toContain("indexed documents");
    expect(answer.citations).toEqual([]);
    expect(answer.chart).toBeNull();
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
