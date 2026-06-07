import { describe, expect, test } from "bun:test";
import {
  generateAnswerFromDocuments,
  parseModelAnswer,
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
