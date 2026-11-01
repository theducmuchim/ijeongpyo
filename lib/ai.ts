import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { ImagePayload } from "@/types";

// AI를 부르는 코드는 이 파일에만 둔다. 다른 AI로 바꿀 때 여기만 고치면 된다.
// 키는 Vercel 환경변수에만 둔다. 화면 코드에는 절대 넣지 않는다.
const API_KEY = process.env.GEMINI_API_KEY;
// 무료로 쓸 수 있는 모델은 자주 바뀐다. AI Studio에서 '무료'로 표시된 Flash 모델 이름을 넣는다.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// 키가 없으면 시험 모드: AI를 부르지 않고 예시 답을 돌려준다(화면 흐름 점검용).
export const isMockMode = () => !API_KEY;

let client: GoogleGenAI | null = null;
const getClient = () => (client ??= new GoogleGenAI({ apiKey: API_KEY }));

export async function askAI(system: string, images: ImagePayload[], text: string): Promise<string> {
  const res = await getClient().models.generateContent({
    model: MODEL,
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
      temperature: 0.2,
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
