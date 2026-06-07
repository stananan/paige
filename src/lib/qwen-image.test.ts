import { describe, expect, test } from "bun:test";
import {
  buildQwenImageRequest,
  generateQwenImage,
  parseQwenImageResponse,
} from "./qwen-image";

const successfulResponse = {
  request_id: "request-1",
  output: {
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: [
            {
              image:
                "https://dashscope-result-sg.oss-ap-southeast-1.aliyuncs.com/generated.png",
            },
            { text: "Revenue chart" },
          ],
        },
      },
    ],
  },
  usage: { width: 1024, height: 1024, image_count: 1 },
};

describe("buildQwenImageRequest", () => {
  test("builds the verified z-image-turbo request shape", () => {
    expect(
      buildQwenImageRequest({
        prompt: "A clean revenue chart",
        seed: 7,
      }),
    ).toEqual({
      model: "z-image-turbo",
      input: {
        messages: [
          {
            role: "user",
            content: [{ text: "A clean revenue chart" }],
          },
        ],
      },
      parameters: {
        prompt_extend: false,
        size: "1024*1024",
        seed: 7,
      },
    });
  });

  test("rejects empty, oversized, and invalid-dimension inputs", () => {
    expect(() => buildQwenImageRequest({ prompt: " " })).toThrow("prompt is required");
    expect(() => buildQwenImageRequest({ prompt: "a".repeat(801) })).toThrow(
      "800 characters or fewer",
    );
    expect(() =>
      buildQwenImageRequest({ prompt: "chart", size: "4096*4096" }),
    ).toThrow("between 512 and 2048");
    expect(() => buildQwenImageRequest({ prompt: "chart", seed: -1 })).toThrow(
      "between 0 and 2147483647",
    );
  });
});

describe("parseQwenImageResponse", () => {
  test("extracts trusted image output and metadata", () => {
    const parsed = parseQwenImageResponse(successfulResponse);

    expect(parsed.imageUrl.hostname).toBe(
      "dashscope-result-sg.oss-ap-southeast-1.aliyuncs.com",
    );
    expect(parsed.requestId).toBe("request-1");
    expect(parsed.width).toBe(1024);
    expect(parsed.height).toBe(1024);
  });

  test("rejects model-provided URLs outside DashScope result storage", () => {
    const unsafe = structuredClone(successfulResponse);
    unsafe.output.choices[0].message.content[0].image = "http://127.0.0.1/internal";

    expect(() => parseQwenImageResponse(unsafe)).toThrow("untrusted image URL");
  });

  test("rejects malformed provider responses cleanly", () => {
    expect(() => parseQwenImageResponse(null)).toThrow("invalid response");
  });
});

describe("generateQwenImage", () => {
  test("calls DashScope and downloads the generated PNG", async () => {
    const calls: string[] = [];
    const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
      const url = String(input);
      calls.push(url);
      if (calls.length === 1) return Response.json(successfulResponse);
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "Content-Type": "image/png", "Content-Length": "4" },
      });
    };

    const result = await generateQwenImage(
      { prompt: "A clean revenue chart" },
      {
        environment: { QWEN_API_KEY: "test-key" },
        fetchImpl,
      },
    );

    expect(calls[0]).toContain("dashscope-intl.aliyuncs.com");
    expect(calls[1]).toContain("dashscope-result-sg");
    expect(result.bytes).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(result.model).toBe("z-image-turbo");
  });
});
