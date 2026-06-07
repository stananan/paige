import { describe, expect, test } from "bun:test";
import { classifyVisualRequest, visualRequestForAnswer } from "./visual-intent";

describe("classifyVisualRequest", () => {
  test("product / scene prompts are creative, not data", () => {
    expect(classifyVisualRequest("visualize our new products")).toBe("creative");
    expect(classifyVisualRequest("draw our flagship product")).toBe("creative");
    expect(classifyVisualRequest("illustrate our company culture")).toBe("creative");
  });

  test("explicit chart words are data", () => {
    expect(classifyVisualRequest("chart our revenue")).toBe("data");
    expect(classifyVisualRequest("make a graph of headcount")).toBe("data");
  });

  test("numeric or comparison intent is data", () => {
    expect(classifyVisualRequest("visualize Q3 revenue")).toBe("data");
    expect(classifyVisualRequest("visualize our revenue trend")).toBe("data");
  });

  test("non-visual prompts return null", () => {
    expect(classifyVisualRequest("what was revenue last year?")).toBeNull();
    expect(classifyVisualRequest("")).toBeNull();
  });
});

describe("visualRequestForAnswer", () => {
  const cited = [{ sourceFile: "x.pdf", page: "1" }];

  test("a built chart always forces a data visual", () => {
    expect(
      visualRequestForAnswer("anything at all", {
        answer: "ok",
        citations: [],
        chart: { title: "t", labels: ["a", "b"], values: [1, 2], unit: "%" },
      }),
    ).toEqual({ kind: "data" });
  });

  test("a declined answer never gets a visual, even a creative one", () => {
    expect(
      visualRequestForAnswer("draw our newest product", {
        answer: "I don't see that in the indexed documents.",
        citations: [],
        chart: null,
      }),
    ).toBeNull();
  });

  test("a creative product prompt with a real answer generates", () => {
    expect(
      visualRequestForAnswer("draw our newest product", {
        answer: "Our newest product is the FDC field tablet.",
        citations: cited,
        chart: null,
      }),
    ).toEqual({ kind: "creative" });
  });
});
