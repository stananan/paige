import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { POST } from "./route";

describe("POST /api/image", () => {
  test("rejects a numeric visual without source-verified chart data", async () => {
    const request = new NextRequest("http://localhost/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic:
          "Compare the Q2 2025 actual report with the Q2 2026 forecast and create a visual",
        answer: "Q2 2025 was $16.8 million and Q2 2026 was $21.6 million.",
        kind: "data",
        chart: null,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Numeric visuals require source-verified chart data",
    });
  });
});
