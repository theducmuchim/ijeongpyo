import "server-only";

// 기기 하나당 하루 AI 호출 수 제한. 제미나이 무료 한도는 앱 전체(프로젝트 하나)가 나눠 쓰기 때문이다.
// Upstash Redis 주소와 토큰이 있으면 거기에 세고, 없으면 서버 메모리에 센다(개발·시험용).
const DAILY_LIMIT = Number(process.env.DAILY_AI_LIMIT_PER_DEVICE || 10);
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

// 호출해도 되면 true. 한 번 부를 때마다 1씩 센다.
// kind로 따로 센다: ai(사진 AI, 기본 10번), voice(말 알아듣기), tts(목소리 만들기)
export async function checkLimit(deviceId: string | null, kind = "ai", limit = DAILY_LIMIT): Promise<boolean> {
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
