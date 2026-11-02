import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { ImagePayload } from "@/types";

// AI를 부르는 코드는 이 파일에만 둔다. 다른 AI로 바꿀 때 여기만 고치면 된다.
// 키는 Vercel 환경변수에만 둔다. 화면 코드에는 절대 넣지 않는다.
const API_KEY = process.env.GEMINI_API_KEY;
// 무료로 쓸 수 있는 모델은 자주 바뀐다. AI Studio에서 '무료'로 표시된 모델 이름을 넣는다.
// 2.5 모델은 새 키로는 쓸 수 없다(404). 무료 한도: Flash 하루 20번, Flash-Lite 하루 500번 정도 (프로젝트 전체).
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
// Flash 한도를 다 쓰거나 모델이 없어지면 이 모델로 한 번 더 부른다. 글만 보내는 일(카드 초안)은 처음부터 이걸 쓴다.
const LITE_MODEL = process.env.GEMINI_LITE_MODEL || "gemini-3.5-flash-lite";

// 키가 없으면 시험 모드: AI를 부르지 않고 예시 답을 돌려준다(화면 흐름 점검용).
export const isMockMode = () => !API_KEY;

let client: GoogleGenAI | null = null;
// SDK는 기본으로 429에서 최대 5번, 길게는 1분씩 기다리며 다시 부른다. 그러면 서버 시간 제한(60초)을 넘겨 버리므로
// 다시 부르기는 끄고 한 번에 20초까지만 기다린다. 한도에 걸리면 아래에서 lite 모델로 바꿔 부른다.
const getClient = () => (client ??= new GoogleGenAI({ apiKey: API_KEY, httpOptions: { timeout: 20000, retryOptions: { attempts: 1 } } }));

const switchable = (e: unknown) => /429|RESOURCE_EXHAUSTED|quota|404|NOT_FOUND|500|503|UNAVAILABLE|INTERNAL|high demand|timeout|timed out|abort|deadline/i.test(String((e as Error)?.message ?? e));

export async function askAI(system: string, images: ImagePayload[], text: string, opts: { lite?: boolean } = {}): Promise<string> {
  if (opts.lite || MODEL === LITE_MODEL) return callModel(LITE_MODEL, system, images, text);
  try {
    return await callModel(MODEL, system, images, text);
  } catch (e) {
    if (!switchable(e)) throw e;
    console.error(`[ai] ${MODEL} 실패, ${LITE_MODEL}로 다시: ${String((e as Error).message).slice(0, 160)}`);
    return callModel(LITE_MODEL, system, images, text);
  }
}

// Gemini 3 계열은 temperature를 낮추면 오히려 답이 늦거나 꼬일 수 있어 기본값을 쓴다.
// 생각(thinking)은 길안내에 깊이 필요 없어서 낮게 둔다. GEMINI_THINKING = minimal | low | medium | high | default
export const tuning = { thinking: (process.env.GEMINI_THINKING || "low").toLowerCase(), temperature: process.env.GEMINI_TEMPERATURE };
function modelTuning(model: string) {
  const out: { temperature?: number; thinkingConfig?: { thinkingLevel: ThinkingLevel } } = {};
  if (tuning.temperature) out.temperature = Number(tuning.temperature);
  const levels: Record<string, ThinkingLevel> = { minimal: ThinkingLevel.MINIMAL, low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH };
  if (model !== LITE_MODEL && levels[tuning.thinking]) out.thinkingConfig = { thinkingLevel: levels[tuning.thinking] };
  return out;
}

// 점검 주소에서 어느 모델이 답했는지 보려고 남긴다
export const aiTrace: { model: string; ms: number; ok: boolean; error?: string }[] = [];

async function callModel(model: string, system: string, images: ImagePayload[], text: string): Promise<string> {
  const t = Date.now();
  try {
    const out = await callModelRaw(model, system, images, text);
    aiTrace.push({ model, ms: Date.now() - t, ok: true });
    return out;
  } catch (e) {
    aiTrace.push({ model, ms: Date.now() - t, ok: false, error: String((e as Error)?.message ?? e).slice(0, 300) });
    throw e;
  }
}

async function callModelRaw(model: string, system: string, images: ImagePayload[], text: string): Promise<string> {
  const res = await getClient().models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          // 사진 먼저
          ...images.map((img) => ({ inlineData: { mimeType: img.mediaType, data: img.base64 } })),
          // 그다음 질문
          { text },
        ],
      },
    ],
    config: {
      systemInstruction: system, // lib/prompts.ts의 지시문
      responseMimeType: "application/json", // JSON으로만 답하게 함
      ...modelTuning(model),
    },
  });
  return res.text ?? "";
}

// 무료 한도 초과(429) 같은 오류를 사용자에게 보여 줄 말로 바꾼다.
export function friendlyError(e: unknown): { message: string; status: number } {
  const text = String((e as { message?: string })?.message ?? e);
  // Vercel 로그에서 원인을 볼 수 있게 남긴다 (키 값은 오류 문장에 들어가지 않는다)
  console.error(`[ai] Gemini 호출 실패 (모델 ${MODEL}): ${text.slice(0, 300)}`);
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(text)) {
    return { message: "사용하는 사람이 많아요. 잠시 뒤 다시 해 주세요.", status: 429 };
  }
  return { message: "AI 답을 받지 못했어요. 잠시 뒤 다시 해 주세요.", status: 502 };
}
