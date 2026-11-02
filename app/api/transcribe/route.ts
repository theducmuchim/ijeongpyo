import { friendlyError, isMockMode, transcribe } from "@/lib/ai";
import { checkLimit } from "@/lib/rateLimit";

export const maxDuration = 30;

// 녹음한 한마디(16kHz WAV) → 글. 브라우저 음성 인식이 안 되는 곳(아이폰·아이패드의 크롬 등)에서 쓴다.
// 사진 AI 횟수와 따로 센다.
const PER_DEVICE = Number(process.env.DAILY_VOICE_LIMIT_PER_DEVICE || 80);
const MAX_B64 = 600_000; // 약 18초

export async function POST(req: Request) {
  let body: { wav?: string; hints?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "보낸 내용을 읽지 못했어요. 다시 해 주세요." }, { status: 400 });
  }
  const wav = typeof body.wav === "string" ? body.wav : "";
  if (!wav || wav.length > MAX_B64) return Response.json({ error: "녹음이 비었거나 너무 길어요. 짧게 다시 말해 주세요." }, { status: 400 });
  if (isMockMode()) return Response.json({ text: "다음", mock: true });
  if (!(await checkLimit(req.headers.get("x-device-id"), "voice", PER_DEVICE))) {
    return Response.json({ error: "오늘 말로 하기를 많이 써서 잠시 쉬어요. 버튼을 눌러 주세요." }, { status: 429 });
  }
  try {
    const hints = (Array.isArray(body.hints) ? body.hints : []).filter((h) => typeof h === "string").slice(0, 40);
    return Response.json({ text: await transcribe(wav, hints) });
  } catch (e) {
    const { message, status } = friendlyError(e);
    return Response.json({ error: message }, { status });
  }
}
