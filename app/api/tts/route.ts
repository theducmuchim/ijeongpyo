import { friendlyError, isMockMode, synthesize } from "@/lib/ai";
import { checkLimit } from "@/lib/rateLimit";

export const maxDuration = 30;

// 글 → 자연스러운 목소리(WAV). 같은 문장은 Vercel CDN이 1년 동안 저장해 두므로, 누가 한 번 들은 문장은
// 다음 사람부터 AI를 부르지 않는다(무료 한도를 아낀다). 그래서 POST가 아니라 주소에 글이 들어가는 GET이다.
const MAX_CHARS = 220;
const PER_DEVICE = Number(process.env.DAILY_TTS_LIMIT_PER_DEVICE || 300);

const noStore = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const text = (new URL(req.url).searchParams.get("t") ?? "").trim().slice(0, MAX_CHARS);
  if (!text) return noStore(400, "읽을 글이 없어요.");
  if (isMockMode()) return noStore(503, "시험 모드라 AI 목소리가 없어요.");
  if (!(await checkLimit(req.headers.get("x-device-id") ?? "no-device", "tts", PER_DEVICE))) return noStore(429, "오늘 목소리를 많이 만들어서 휴대폰 목소리로 바꿔요.");
  try {
    const { pcm, rate } = await synthesize(text);
    const body = Buffer.from(pcm, "base64");
    return new Response(new Uint8Array(Buffer.concat([wavHeader(body.length, rate), body])), {
      headers: {
        "content-type": "audio/wav",
        // 같은 주소(같은 문장)는 바뀌지 않는다
        "cache-control": "public, max-age=31536000, immutable",
        "cdn-cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    const { status } = friendlyError(e);
    return noStore(status, "목소리를 만들지 못했어요.");
  }
}

function wavHeader(bytes: number, rate: number) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + bytes, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // 한 채널
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(bytes, 40);
  return h;
}
