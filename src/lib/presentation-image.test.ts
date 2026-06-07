import { describe, expect, test } from "bun:test";
import {
  buildPresentationImagePrompt,
  generatePresentationImage,
} from "./presentation-image";

const minimaxSuccess = {
  id: "mm-1",
  data: { image_urls: ["http://hailuo-image-test.oss-us-east-1.aliyuncs.com/m.jpg"] },
  base_resp: { status_code: 0, status_msg: "success" },
};

describe("buildPresentationImagePrompt", () => {
  test("creates a subject-specific horizontal data prompt", () => {
    const prompt = buildPresentationImagePrompt({
      topic: "FDC revenue growth",
      answer: "Revenue increased from $16.8 million to $21.6 million.",
      kind: "data",
      chart: {
        title: "Revenue",
        labels: ["Q2 2025", "Q2 2026"],
        values: [16.8, 21.6],
      },
    });
    expect(prompt).toContain("horizontal 16:9");
    expect(prompt).toContain("Revenue");
    expect(prompt).toContain("upward progression");
    expect(prompt).toContain("business growth");
    expect(prompt).toContain("Do not include text");
  });

  test("removes source values from generated pixels", () => {
    const prompt = buildPresentationImagePrompt({
      topic: "Compare Q2 2025 revenue of $16.8 million with Q2 2026 at $21.6 million",
      answer: "Revenue increased from $16.8 million to $21.6 million.",
      kind: "data",
      chart: {
        title: "Revenue",
        labels: ["Q2 2025", "Q2 2026"],
        values: [16.8, 21.6],
      },
    });
    expect(prompt).not.toContain("Q2");
    expect(prompt).not.toContain("2025");
    expect(prompt).not.toContain("16.8");
    expect(prompt).toContain("verified source labels and exact values");
  });

  test("keeps a creative request literal instead of replacing it with abstraction", () => {
    const prompt = buildPresentationImagePrompt({
      topic: "Draw a futuristic retail operations command center",
      kind: "creative",
    });
    expect(prompt).toContain("futuristic retail operations command center");
    expect(prompt).toContain("Follow the requested scene literally");
    expect(prompt).toContain("Do not replace the subject with generic abstract waves");
  });
});

describe("generatePresentationImage", () => {
  test("uses MiniMax image-01 at 16:9", async () => {
    let requestBody: Record<string, unknown> | null = null;
    const fetchImpl = async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = String(input);
      if (url.includes("api.minimax.io")) {
        requestBody = JSON.parse(String(init?.body));
        return Response.json(minimaxSuccess);
      }
      return new Response(new Uint8Array([255, 216, 255]), {
        headers: { "Content-Type": "image/jpeg", "Content-Length": "3" },
      });
    };

    const result = await generatePresentationImage("topic", {
      environment: { MINIMAX_API_KEY: "m" },
      fetchImpl,
    });

    expect(requestBody).toMatchObject({
      model: "image-01",
      aspect_ratio: "16:9",
    });
    expect(result.model).toBe("MiniMax image-01");
    expect(result.bytes).toEqual(new Uint8Array([255, 216, 255]));
  });

  test("retries one transient generation failure", async () => {
    let generations = 0;
    const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
      const url = String(input);
      if (url.includes("api.minimax.io")) {
        generations += 1;
        if (generations === 1) return new Response("temporary", { status: 503 });
        return Response.json(minimaxSuccess);
      }
      return new Response(new Uint8Array([255, 216, 255]), {
        headers: { "Content-Type": "image/jpeg", "Content-Length": "3" },
      });
    };

    await expect(
      generatePresentationImage("topic", {
        environment: { MINIMAX_API_KEY: "m" },
        fetchImpl,
      }),
    ).resolves.toMatchObject({ model: "MiniMax image-01" });
    expect(generations).toBe(2);
  });

  test("does not retry a missing key", async () => {
    let calls = 0;
    const fetchImpl = async (): Promise<Response> => {
      calls += 1;
      return new Response();
    };

    await expect(
      generatePresentationImage("topic", { environment: {}, fetchImpl }),
    ).rejects.toThrow("Missing MINIMAX_API_KEY");
    expect(calls).toBe(0);
  });
});
