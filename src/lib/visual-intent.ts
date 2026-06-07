export type VisualRequestKind = "data" | "creative";

export interface VisualAnswerShape {
  answer: string;
  citations: unknown[];
  chart: unknown | null;
}

const DATA_VISUAL_PATTERN =
  /\b(?:chart|graph|plot|dashboard|data\s+visuali[sz]ation)\b/i;
const DATA_COMPARISON_PATTERN =
  /\b(?:compare|comparison|versus|vs\.?|trend|over time|year over year|yoy|across periods?)\b/i;
const NUMERIC_DATA_PATTERN =
  /\b(?:data points?|statistics?|metrics?|revenue|arr|margin|income|cash flow|customers?|headcount|employees?|bookings?|churn|retention|nrr|q[1-4]|quarter\s*[1-4]|first quarter|second quarter|third quarter|fourth quarter)\b/i;
const VISUAL_NOUN_PATTERN =
  /\b(?:visual|visuali[sz](?:e|ation)?|graphic|diagram|infographic|illustration|image|picture|sketch|rendering)\b/i;
const CREATIVE_ACTION_PATTERN =
  /\b(?:draw|sketch|illustrate|render|paint|design)\b|(?:\b(?:create|generate|make)\b.{0,32}\b(?:visual|graphic|diagram|infographic|illustration|image|picture|sketch|rendering)\b)/i;
const UNAVAILABLE_DATA_PATTERN =
  /\b(?:(?:do not|don['’]t|cannot|can['’]t|could not|couldn['’]t|did not|didn['’]t)\s+(?:see|find|have|locate|access)|no\s+(?:supporting|underlying|matching|relevant)\s+(?:data|figures?|numbers?|documents?|sources?)|not\s+(?:available|present|included|found)\s+in\s+(?:the\s+)?(?:indexed\s+)?documents?)\b/i;

export function classifyVisualRequest(question: string): VisualRequestKind | null {
  const normalized = question.trim();
  if (!normalized) return null;
  if (DATA_VISUAL_PATTERN.test(normalized)) return "data";

  const asksForVisual =
    VISUAL_NOUN_PATTERN.test(normalized) || CREATIVE_ACTION_PATTERN.test(normalized);
  if (!asksForVisual) return null;
  // "data" means the request is actually about numbers or a comparison, not
  // merely that it mentions the company. Otherwise a product/scene request like
  // "visualize our new products" gets forced into the chart-style data prompt
  // and renders an abstract corporate scene instead of the product itself.
  const numericIntent =
    DATA_COMPARISON_PATTERN.test(normalized) || NUMERIC_DATA_PATTERN.test(normalized);
  return numericIntent ? "data" : "creative";
}

export function answerDeclinesAvailableData(answer: string): boolean {
  return UNAVAILABLE_DATA_PATTERN.test(answer);
}

export function visualRequiresChart(question: string): boolean {
  if (classifyVisualRequest(question) !== "data") return false;
  return (
    DATA_VISUAL_PATTERN.test(question) ||
    DATA_COMPARISON_PATTERN.test(question) ||
    NUMERIC_DATA_PATTERN.test(question)
  );
}

export function visualRequestForAnswer(
  question: string,
  answer: VisualAnswerShape,
): { kind: VisualRequestKind } | null {
  if (answer.chart) return { kind: "data" };

  const kind = classifyVisualRequest(question);
  if (!kind) return null;
  // Never illustrate a non-answer: if Paige said the figures aren't in the
  // documents, skip the visual regardless of creative-vs-data styling.
  if (answerDeclinesAvailableData(answer.answer)) return null;
  if (kind === "creative") return { kind };
  if (visualRequiresChart(question)) return null;
  return answer.citations.length > 0 ? { kind } : null;
}
