export type VisualRequestKind = "data" | "creative";

export interface VisualAnswerShape {
  answer: string;
  citations: unknown[];
  chart: unknown | null;
}

const DATA_VISUAL_PATTERN =
  /\b(?:chart|graph|plot|dashboard|data\s+visuali[sz]ation)\b/i;
const VISUAL_NOUN_PATTERN =
  /\b(?:visual|visuali[sz](?:e|ation)?|graphic|diagram|infographic|illustration|image|picture|sketch|rendering)\b/i;
const CREATIVE_ACTION_PATTERN =
  /\b(?:draw|sketch|illustrate|render|paint|design)\b|(?:\b(?:create|generate|make)\b.{0,32}\b(?:visual|graphic|diagram|infographic|illustration|image|picture|sketch|rendering)\b)/i;
const COMPANY_DATA_PATTERN =
  /\b(?:fdc|company|our|reports?|pdfs?|documents?|sources?|citations?|evidence|data|statistics?|metrics?|q[1-4]|quarters?|fy20\d{2}|20\d{2}|revenue|arr|margin|income|cash|customers?|renewals?|pipeline|incidents?|security|compliance|headcount|employees?|forecast|budget|sales|support|roadmap|bookings?|churn|retention|nrr)\b/i;
const UNAVAILABLE_DATA_PATTERN =
  /\b(?:(?:do not|don['’]t|cannot|can['’]t|could not|couldn['’]t|did not|didn['’]t)\s+(?:see|find|have|locate|access)|no\s+(?:supporting|underlying|matching|relevant)\s+(?:data|figures?|numbers?|documents?|sources?)|not\s+(?:available|present|included|found)\s+in\s+(?:the\s+)?(?:indexed\s+)?documents?)\b/i;

export function classifyVisualRequest(question: string): VisualRequestKind | null {
  const normalized = question.trim();
  if (!normalized) return null;
  if (DATA_VISUAL_PATTERN.test(normalized)) return "data";

  const asksForVisual =
    VISUAL_NOUN_PATTERN.test(normalized) || CREATIVE_ACTION_PATTERN.test(normalized);
  if (!asksForVisual) return null;
  return COMPANY_DATA_PATTERN.test(normalized) ? "data" : "creative";
}

export function answerDeclinesAvailableData(answer: string): boolean {
  return UNAVAILABLE_DATA_PATTERN.test(answer);
}

export function visualRequestForAnswer(
  question: string,
  answer: VisualAnswerShape,
): { kind: VisualRequestKind } | null {
  if (answer.chart) return { kind: "data" };

  const kind = classifyVisualRequest(question);
  if (!kind) return null;
  if (kind === "creative") return { kind };
  if (answerDeclinesAvailableData(answer.answer)) return null;
  return answer.citations.length > 0 ? { kind } : null;
}
