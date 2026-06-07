import { describe, expect, test } from "bun:test";
import {
  buildIllustrationPrompt,
  configuredImageProviders,
  raceImageProviders,
} from "./image-race";

const qwenSuccess = {
  request_id: "qwen-1",
  output: {
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: [
            { image: "https://dashscope-result-sg.oss-ap-southeast-1.aliyuncs.com/q.png" },
          ],
        },
      },
    ],
  },
  usage: { width: 1024, height: 1024, image_count: 1 },
};

const qwenFailure = {
  request_id: "qwen-err",
  code: "DataInspectionFailed",
  message: "blocked",
  output: { choices: [{ finish_reason: "error", message: { content: [] } }] },
};

const minimaxSuccess = {
  id: "mm-1",
  data: { image_urls: ["http://hailuo-image-test.oss-us-east-1.aliyuncs.com/m.jpg"] },
  base_resp: { status_code: 0, status_msg: "success" },
};

const bothKeys = { QWEN_API_KEY: "q", MINIMAX_API_KEY: "m" };

function makeFetch({ qwenOk, minimaxOk }: { qwenOk: boolean; minimaxOk: boolean }) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    if (url.includes("dashscope-intl.aliyuncs.com")) {
      return Response.json(qwenOk ? qwenSuccess : qwenFailure);
    }
    if (url.includes("dashscope-result")) {
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "Content-Type": "image/png", "Content-Length": "4" },
      });
    }
    if (url.includes("api.minimax.io")) {
      return minimaxOk
        ? Response.json(minimaxSuccess)
        : new Response("err", { status: 500 });
    }
    if (url.includes("hailuo")) {
      return new Response(new Uint8Array([255, 216, 255]), {
        headers: { "Content-Type": "image/jpeg", "Content-Length": "3" },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  };
}

describe("buildIllustrationPrompt", () => {
  test("includes the subject and forbids text", () => {
    const prompt = buildIllustrationPrompt("FDC revenue growth");
    expect(prompt).toContain("FDC revenue growth");
    expect(prompt).toContain("No text");
  });

  test("uses a default subject when empty", () => {
    expect(buildIllustrationPrompt("   ")).toContain("modern company meeting");
  });
});

describe("configuredImageProviders", () => {
  test("detects each provider's key", () => {
    expect(configuredImageProviders({ QWEN_API_KEY: "q" })).toEqual(["Qwen"]);
    expect(configuredImageProviders({ MINIMAX_API_KEY: "m" })).toEqual(["MiniMax"]);
    expect(configuredImageProviders(bothKeys)).toEqual(["Qwen", "MiniMax"]);
    expect(configuredImageProviders({})).toEqual([]);
  });
});

describe("raceImageProviders", () => {
  test("returns the Qwen image when MiniMax fails", async () => {
    const image = await raceImageProviders("topic", {
      environment: bothKeys,
      fetchImpl: makeFetch({ qwenOk: true, minimaxOk: false }),
    });
    expect(image.model).toBe("Qwen");
    expect(image.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  test("returns the MiniMax image when Qwen fails", async () => {
    const image = await raceImageProviders("topic", {
      environment: bothKeys,
      fetchImpl: makeFetch({ qwenOk: false, minimaxOk: true }),
    });
    expect(image.model).toBe("MiniMax");
    expect(image.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  test("throws when every provider fails", async () => {
    await expect(
      raceImageProviders("topic", {
        environment: bothKeys,
        fetchImpl: makeFetch({ qwenOk: false, minimaxOk: false }),
      }),
    ).rejects.toThrow("All image providers failed");
  });

  test("throws when no provider is configured", async () => {
    await expect(
      raceImageProviders("topic", { environment: {}, fetchImpl: makeFetch({ qwenOk: true, minimaxOk: true }) }),
    ).rejects.toThrow("No image provider");
  });
});
