import { describe, expect, test } from "bun:test";
import {
  appendConversationTurn,
  decodePaigeRoomEvent,
  encodePaigeRoomEvent,
  interactionIdFromImageName,
  sharedImageFileName,
  transcriptIntent,
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

  test("opens a flowing session and accepts follow-ups without the wake word", () => {
    expect(transcriptIntent("Paige", false)).toEqual({ type: "activate" });
    expect(transcriptIntent("Paige, show Q2 revenue", false)).toEqual({
      type: "ask",
      command: "show Q2 revenue",
      activate: true,
    });
    expect(transcriptIntent("What about ARR?", true)).toEqual({
      type: "ask",
      command: "What about ARR?",
      activate: false,
    });
    expect(transcriptIntent("What about ARR?", false)).toEqual({ type: "ignore" });
  });

  test("recognizes natural session-ending phrases", () => {
    expect(transcriptIntent("Thanks Paige", true)).toEqual({ type: "end" });
    expect(transcriptIntent("That's it", true)).toEqual({ type: "end" });
    expect(transcriptIntent("We are done Paige", true)).toEqual({ type: "end" });
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
});
