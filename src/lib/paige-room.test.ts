import { describe, expect, test } from "bun:test";
import {
  appendConversationTurn,
  decodePaigeRoomEvent,
  encodePaigeRoomEvent,
  interactionIdFromImageName,
  isSubstantiveTranscript,
  sharedImageFileName,
  shouldGenerateVisual,
  transcriptWordCount,
  type PaigeRoomEvent,
} from "./paige-room";

describe("Paige room protocol", () => {
  test("round-trips a shared answer event", () => {
    const event: PaigeRoomEvent = {
      version: 1,
      type: "answer",
      eventId: "event-1",
      interactionId: "interaction-1",
      question: "What was Q2 revenue?",
      speaker: "stan",
      sessionActive: true,
      answer: {
        answer: "FDC reported $16.8 million in Q2 revenue.",
        citations: [{ sourceFile: "q2.pdf", page: "1", url: "/q2.pdf#page=1" }],
        chart: null,
        model: "test-model",
      },
      at: 10,
      by: "stan",
    };

    expect(decodePaigeRoomEvent(encodePaigeRoomEvent(event))).toEqual(event);
  });

  test("rejects malformed room data", () => {
    expect(decodePaigeRoomEvent(new TextEncoder().encode("{bad"))).toBeNull();
    expect(
      decodePaigeRoomEvent(
        new TextEncoder().encode(
          JSON.stringify({ version: 1, type: "answer", eventId: "x", at: 1, by: "x" }),
        ),
      ),
    ).toBeNull();
  });

  test("rejects unsafe citation URLs from room participants", () => {
    const event: PaigeRoomEvent = {
      version: 1,
      type: "answer",
      eventId: "event-unsafe",
      interactionId: "interaction-unsafe",
      question: "Show the report",
      speaker: "stan",
      sessionActive: true,
      answer: {
        answer: "Here it is.",
        citations: [
          {
            sourceFile: "report.pdf",
            page: "1",
            url: "javascript:alert(1)",
          },
        ],
        chart: null,
        model: "test-model",
      },
      at: 10,
      by: "stan",
    };

    expect(decodePaigeRoomEvent(encodePaigeRoomEvent(event))).toBeNull();
  });

  test("keeps the three-word rule only for interrupting Paige", () => {
    expect(transcriptWordCount("Paige, show Q2 revenue.")).toBe(4);
    expect(isSubstantiveTranscript("okay")).toBe(false);
    expect(isSubstantiveTranscript("hold on a second")).toBe(true);
  });

  test("keeps only the latest shared context turns", () => {
    const history = Array.from({ length: 8 }, (_, index) => ({
      question: `q${index}`,
      answer: `a${index}`,
    })).reduce(appendConversationTurn, []);
    expect(history).toHaveLength(6);
    expect(history[0].question).toBe("q2");
  });

  test("correlates shared image streams to an answer", () => {
    const name = sharedImageFileName("answer-123", "Qwen z-image", "image/png");
    expect(name).toBe("answer-123--Qwen-z-image.png");
    expect(interactionIdFromImageName(name)).toBe("answer-123");
  });

  test("generates visuals only when the request has a valid visual path", () => {
    const chartAnswer = {
      answer: "Revenue increased.",
      chart: {
        title: "Revenue",
        labels: ["Q2 2025", "Q2 2026"],
        values: [16.8, 20.1],
        unit: "$M",
      },
      citations: [],
    };
    expect(shouldGenerateVisual("Pull up the Q2 numbers", chartAnswer)).toBe(true);
    expect(
      shouldGenerateVisual("Make an image of the report", {
        answer: "The report shows a stronger Q2 outlook.",
        citations: [{ sourceFile: "q2.pdf", page: "1" }],
        chart: null,
      }),
    ).toBe(true);
    expect(
      shouldGenerateVisual("What did the report say?", {
        answer: "The report shows a stronger Q2 outlook.",
        citations: [{ sourceFile: "q2.pdf", page: "1" }],
        chart: null,
      }),
    ).toBe(false);
    expect(
      shouldGenerateVisual("Draw something for this data", {
        answer: "I don't see the underlying figures in the indexed documents.",
        citations: [],
        chart: null,
      }),
    ).toBe(false);
    expect(
      shouldGenerateVisual("Draw a futuristic retail operations command center", {
        answer: "I’ll create that visual for everyone now.",
        citations: [],
        chart: null,
      }),
    ).toBe(true);
    expect(
      shouldGenerateVisual("Visualize a futuristic retail operations command center", {
        answer: "I’ll create that visual for everyone now.",
        citations: [],
        chart: null,
      }),
    ).toBe(true);
    expect(
      shouldGenerateVisual("Create a graph comparing Q5 revenue in 2030 and 2031", {
        answer: "I couldn't find those figures in the indexed documents.",
        citations: [],
        chart: null,
      }),
    ).toBe(false);
  });
});
