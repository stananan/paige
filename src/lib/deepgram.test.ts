import { describe, expect, test } from "bun:test";
import {
  parseDeepgramTranscript,
  transcribeDeepgramAudio,
} from "./deepgram";

describe("Deepgram transcription", () => {
  test("parses the best transcript and word count", () => {
    expect(
      parseDeepgramTranscript({
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: "Paige compare Q2 revenue",
                  confidence: 0.97,
                  words: [{}, {}, {}, {}],
                },
              ],
            },
          ],
        },
      }),
    ).toEqual({
      transcript: "Paige compare Q2 revenue",
      confidence: 0.97,
      words: 4,
    });
  });

  test("sends browser audio to Nova 3 without exposing the key", async () => {
    let authorization = "";
    let requestUrl = "";
    const result = await transcribeDeepgramAudio(
      new Uint8Array([1, 2, 3]),
      "audio/webm;codecs=opus",
      {
        environment: { DEEPGRAM_API_KEY: "server-secret" },
        fetchImpl: async (input, init) => {
          const request = new Request(input, init);
          authorization = request.headers.get("authorization") || "";
          requestUrl = request.url;
          return Response.json({
            results: {
              channels: [
                {
                  alternatives: [
                    {
                      transcript: "Show quarter two revenue",
                      confidence: 0.91,
                      words: [{}, {}, {}, {}],
                    },
                  ],
                },
              ],
            },
          });
        },
      },
    );

    expect(result.transcript).toBe("Show quarter two revenue");
    expect(authorization).toBe("Token server-secret");
    expect(requestUrl).toContain("model=nova-3");
    expect(requestUrl).toContain("keyterm=Paige");
  });

  test("rejects unsupported audio before calling Deepgram", async () => {
    await expect(
      transcribeDeepgramAudio(new Uint8Array([1]), "text/plain", {
        environment: { DEEPGRAM_API_KEY: "secret" },
      }),
    ).rejects.toThrow("format is not supported");
  });
});
