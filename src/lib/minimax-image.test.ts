import { describe, expect, test } from "bun:test";
import {
  buildMiniMaxImageRequest,
  generateMiniMaxImage,
  parseMiniMaxImageResponse,
} from "./minimax-image";

const successfulResponse = {
  id: "mm-1",
  data: {
    image_urls: ["http://hailuo-image-test.oss-us-east-1.aliyuncs.com/generated.jpg"],
  },
  base_resp: { status_code: 0, status_msg: "success" },
};

describe("buildMiniMaxImageRequest", () => {
  test("builds the image-01 request shape", () => {
    expect(buildMiniMaxImageRequest({ prompt: "A calm illustration" })).toEqual({
      model: "image-01",
      prompt: "A calm illustration",
      aspect_ratio: "1:1",
      response_format: "url",
      n: 1,
      prompt_optimizer: true,
    });
    expect(
      buildMiniMaxImageRequest({
        prompt: "A constrained presentation image",
        promptOptimizer: false,
      }).prompt_optimizer,
    ).toBe(false);
  });

  test("rejects empty prompts and unsupported aspect ratios", () => {
    expect(() => buildMiniMaxImageRequest({ prompt: " " })).toThrow("prompt is required");
    expect(() =>
      buildMiniMaxImageRequest({ prompt: "x", aspectRatio: "5:1" }),
    ).toThrow("aspect ratio is not supported");
  });
});

describe("parseMiniMaxImageResponse", () => {
  test("extracts the first image URL and request id", () => {
    const parsed = parseMiniMaxImageResponse(successfulResponse);
    expect(parsed.imageUrl.hostname).toBe("hailuo-image-test.oss-us-east-1.aliyuncs.com");
    expect(parsed.requestId).toBe("mm-1");
  });

  test("rejects untrusted image hosts", () => {
    expect(() =>
      parseMiniMaxImageResponse({
        ...successfulResponse,
        data: { image_urls: ["http://127.0.0.1/internal"] },
      }),
    ).toThrow("untrusted image URL");
  });

  test("surfaces a failed generation status", () => {
    expect(() =>
      parseMiniMaxImageResponse({
        id: "mm-2",
        base_resp: { status_code: 1004, status_msg: "auth failed" },
      }),
    ).toThrow("MiniMax image generation failed");
  });
});

describe("generateMiniMaxImage", () => {
  test("calls the endpoint and downloads the generated image", async () => {
    const calls: string[] = [];
    const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
      const url = String(input);
      calls.push(url);
      if (url.includes("api.minimax.io")) return Response.json(successfulResponse);
      return new Response(new Uint8Array([255, 216, 255]), {
        headers: { "Content-Type": "image/jpeg", "Content-Length": "3" },
      });
    };

    const result = await generateMiniMaxImage(
      { prompt: "A calm illustration" },
      { environment: { MINIMAX_API_KEY: "test-key" }, fetchImpl },
    );

    expect(calls[0]).toContain("api.minimax.io/v1/image_generation");
    expect(calls[1]).toContain("hailuo-image-test");
    expect(result.contentType).toBe("image/jpeg");
    expect(result.model).toBe("image-01");
    expect(result.bytes).toEqual(new Uint8Array([255, 216, 255]));
  });

  test("requires MINIMAX_API_KEY", async () => {
    await expect(
      generateMiniMaxImage({ prompt: "x" }, { environment: {} }),
    ).rejects.toThrow("Missing MINIMAX_API_KEY");
  });
});
