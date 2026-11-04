import "server-only";

// 기기 하나당 하루 호출 수 제한. 기본은 제한 없음 (쓰는 사람이 적어서).
// 사용자가 늘어 제미나이 무료 한도(앱 전체가 나눠 씀)가 모자라면 Vercel 환경 변수로 다시 켠다:
// DAILY_AI_LIMIT_PER_DEVICE(사진 AI·카드 초안), DAILY_VOICE_LIMIT_PER_DEVICE(말 알아듣기), DAILY_TTS_LIMIT_PER_DEVICE(목소리 만들기)
// Upstash Redis 주소와 토큰이 있으면 거기에 세고, 없으면 서버 메모리에 센다(개발·시험용).
const LIMIT_ENV: Record<string, string | undefined> = {
  ai: process.env.DAILY_AI_LIMIT_PER_DEVICE,
  voice: process.env.DAILY_VOICE_LIMIT_PER_DEVICE,
  tts: process.env.DAILY_TTS_LIMIT_PER_DEVICE,
};
const limitFor = (kind: string) => {
  const n = Number(LIMIT_ENV[kind]);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
};
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const memory = new Map<string, number>();

const todayKey = (deviceId: string, kind: string) => {
  const d = new Date().toISOString().slice(0, 10);
  return `ijeongpyo:${d}:${kind === "ai" ? "" : `${kind}:`}${deviceId.slice(0, 64)}`;
};

async function upstash(cmd: string[]): Promise<number> {
  const res = await fetch(`${UPSTASH_URL}/${cmd.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    cache: "no-store",
  });
  const json = (await res.json()) as { result: number };
  return json.result;
}

// 호출해도 되면 true. 제한을 켠 종류만 센다. kind: ai, voice, tts
export async function checkLimit(deviceId: string | null, kind = "ai"): Promise<boolean> {
  const limit = limitFor(kind);
  if (limit === Infinity) return true;
  if (!deviceId) return false;
  const key = todayKey(deviceId, kind);
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      const count = await upstash(["incr", key]);
      if (count === 1) await upstash(["expire", key, "90000"]);
      return count <= limit;
    } catch {
      // 저장소에 문제가 있으면 메모리로 센다
    }
  }
  const count = (memory.get(key) ?? 0) + 1;
  memory.set(key, count);
  return count <= limit;
}
