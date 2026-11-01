import { z } from "zod";
import type { CardDraft, ReplaceResult, WhereAmIResult } from "@/types";

// AI가 가끔 앞뒤에 설명을 붙이거나 ```json 으로 감싸서 답할 때를 대비해 JSON 부분만 꺼낸다.
function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.search(/[[{]/);
    const end = Math.max(trimmed.lastIndexOf("]"), trimmed.lastIndexOf("}"));
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

const side = z.enum(["left", "right", "ahead"]);
const action = z.enum(["straight", "left", "right", "arrive"]);

const cardSchema = z.object({
  order: z.number().int().min(1),
  photoDescription: z.string().min(1),
  landmark: z.object({ name: z.string().min(1), side }),
  action,
  instruction: z.string().min(1).max(80),
  warning: z.string().nullable().optional(),
});

const whereSchema = z.object({
  status: z.enum(["on_route", "off_route", "unsure"]),
  confidence: z.number().min(0).max(1),
  seenLandmarks: z.array(z.string()),
  matchedCardOrder: z.number().int().nullable(),
  nextStep: z.string().min(1).max(120),
  askPhoto: z.string().nullable(),
  reasonForUser: z.string(),
});

export function parseCards(raw: string, expected: number): CardDraft[] | null {
  const parsed = z.array(cardSchema).safeParse(extractJson(raw));
  if (!parsed.success || parsed.data.length !== expected) return null;
  return parsed.data.map((c) => ({ ...c, warning: c.warning ?? null }));
}

export function parseWhereAmI(raw: string): WhereAmIResult | null {
  const parsed = whereSchema.safeParse(extractJson(raw));
  if (!parsed.success) return null;
  const r = parsed.data;
  // 확실하지 않은데 사진 요청이 비어 있으면 기본 요청을 채운다 (추측 안내 방지)
  if (r.confidence < 0.6 && !r.askPhoto) r.askPhoto = "다른 방향도 한 장 찍어 주세요";
  return r;
}

const replaceSchema = z.object({
  photoDescription: z.string().min(1),
  landmark: z.object({ name: z.string().min(1), side }),
  instruction: z.string().min(1).max(80),
  changeNote: z.string().default(""),
  warning: z.string().nullable().optional(),
});

export function parseReplace(raw: string): ReplaceResult | null {
  const parsed = replaceSchema.safeParse(extractJson(raw));
  if (!parsed.success) return null;
  return { ...parsed.data, warning: parsed.data.warning ?? null };
}
