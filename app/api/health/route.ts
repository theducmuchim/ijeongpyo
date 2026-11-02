import { TTS_MODELS, aiTrace, askAI, isMockMode, synthesize, transcribe, tuning } from "@/lib/ai";
import { hasStores, rankForLandmark, storesNear } from "@/lib/stores";
import { hasTmap, pedestrianRoute, reverseGeocode, searchPlaces } from "@/lib/tmap";
import { POST as cardsFromWalk } from "../cards-from-walk/route";
import { POST as checkLandmark } from "../check-landmark/route";
import { POST as replaceLandmark } from "../replace-landmark/route";
import { POST as whereAmI } from "../where-am-i/route";
import { POST as planRoute } from "../plan-route/route";

// 바깥 서비스 점검용. 키 값은 절대 돌려주지 않는다.
// HEALTH_TOKEN 환경변수와 같은 ?token= 이 있어야 실제로 부른다 (무료 한도를 아무나 쓰지 못하게).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DAEJEON_STATION = { lat: 36.3323, lng: 127.4342 };
const NEAR = { lat: 36.3293, lng: 127.4275 }; // 대전역에서 600m쯤 떨어진 중앙로 쪽

async function probe<T>(fn: () => Promise<T>) {
  const t = Date.now();
  try {
    const result = await fn();
    return { ok: true, ms: Date.now() - t, result };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, error: String((e as Error).message ?? e).slice(0, 400) };
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const keys = { gemini: !isMockMode(), tmap: hasTmap(), stores: hasStores(), kakaoJs: !!process.env.NEXT_PUBLIC_KAKAO_JS_KEY };
  if (!process.env.HEALTH_TOKEN || token !== process.env.HEALTH_TOKEN) return Response.json({ keys });

  // ?ai=cards|lost|fix: 체험용 사진으로 사진 AI 기능을 실제로 한 번씩 불러 본다
  const which = url.searchParams.get("ai");
  // 시험용: 이 요청에서만 생각 수준·temperature를 바꿔 본다
  if (url.searchParams.get("think")) tuning.thinking = url.searchParams.get("think")!;
  if (url.searchParams.has("temp")) tuning.temperature = url.searchParams.get("temp") || undefined;
  if (which) {
    const photo = async (name: string) => {
      const img = await fetch(`https://ijeongpyo-one.vercel.app/demo/${name}`, { cache: "no-store" });
      return { base64: Buffer.from(await img.arrayBuffer()).toString("base64"), mediaType: "image/jpeg" as const };
    };
    const call = async (handler: (r: Request) => Promise<Response>, body: unknown) => {
      aiTrace.length = 0;
      const t = Date.now();
      const r = await handler(
        new Request("http://local/api", { method: "POST", headers: { "content-type": "application/json", "x-device-id": "health-check" }, body: JSON.stringify(body) }),
      );
      return { status: r.status, ms: Date.now() - t, models: [...aiTrace], result: await r.json() };
    };
    const cards = [
      { order: 1, photoDescription: "왼쪽 건물 1층에 초록 간판 '꽃집 초록뜰'과 초록·흰색 줄무늬 차양. 가게 왼쪽으로 골목이 있다.", landmarkName: "초록 간판 꽃집", instruction: "초록 간판 꽃집을 끼고 왼쪽 골목으로 가세요" },
      { order: 2, photoDescription: "왼쪽에 초록 간판 '온누리약국', 길 건너 빨간 간판 분식집. 바로 앞에 횡단보도가 있다.", landmarkName: "온누리약국", instruction: "온누리약국을 지나 횡단보도를 건너세요" },
      { order: 3, photoDescription: "왼쪽 1층에 파란 간판 '하늘편의점'과 파란·흰색 줄무늬 차양. 오른쪽에 가로수와 가로등.", landmarkName: "파란 간판 편의점", instruction: "파란 간판 편의점 앞에서 오른쪽으로 가세요" },
      { order: 4, photoDescription: "정면에 '한빛중학교' 글자가 있는 정문과 철문.", landmarkName: "한빛중학교 정문", instruction: "한빛중학교 정문이 보이면 도착이에요" },
    ];
    if (which === "cards") {
      const notes = ["꽃집에서 왼쪽", "약국 지나서 횡단보도 건너기", "파란 편의점에서 오른쪽", "학교 정문 도착"];
      const junctions = await Promise.all(notes.map(async (note, i) => ({ photo: await photo(`demo-${i + 1}.jpg`), note })));
      return Response.json(await call(cardsFromWalk, { junctions }));
    }
    if (which === "lost") {
      return Response.json(await call(whereAmI, { photos: [await photo("demo-lost.jpg")], cards, lastCardOrder: 2 }));
    }
    if (which === "fix") {
      return Response.json(
        await call(replaceLandmark, {
          photo: await photo("demo-1-changed.jpg"),
          card: { order: 1, photoDescription: cards[0].photoDescription, landmarkName: "초록 간판 꽃집", side: "left", action: "left", instruction: cards[0].instruction, userNote: "" },
          nextInstruction: cards[1].instruction,
        }),
      );
    }
  }

  // ?check=1: 체험용 사진(온누리약국 간판이 있는 그림)으로 사진 확인을 실제로 한 번 해 본다
  if (url.searchParams.get("check")) {
    const img = await fetch("https://ijeongpyo-one.vercel.app/demo/demo-2.jpg", { cache: "no-store" });
    const base64 = Buffer.from(await img.arrayBuffer()).toString("base64");
    const t = Date.now();
    const r = await checkLandmark(
      new Request("http://local/api/check-landmark", {
        method: "POST",
        headers: { "content-type": "application/json", "x-device-id": "health-check" },
        body: JSON.stringify({ photo: { base64, mediaType: "image/jpeg" }, expected: "온누리약국", candidates: ["하늘편의점"], action: "right", instruction: "온누리약국에서 오른쪽으로 가세요" }),
      }),
    );
    return Response.json({ status: r.status, ms: Date.now() - t, imageBytes: base64.length, check: await r.json() });
  }

  // ?plan=1: 카드 초안을 실제로 한 번 만들어 본다 (대전역 근처 → 대전역)
  // 목소리: 모델마다 소리를 만들어 보고, 만든 소리를 다시 글로 옮겨 본다
  if (url.searchParams.get("tts")) {
    const out: Record<string, unknown> = {};
    let wav: string | null = null;
    for (const m of TTS_MODELS) {
      const t = Date.now();
      try {
        process.env.GEMINI_TTS_MODEL = m;
        const r = await synthesize("꽃집에서 왼쪽으로 가세요. 다음 갈림길까지 약 150미터예요.");
        out[m] = { ok: true, ms: Date.now() - t, bytes: Math.round((r.pcm.length * 3) / 4), rate: r.rate, used: r.model };
        if (!wav) {
          const pcm = Buffer.from(r.pcm, "base64");
          const h = Buffer.alloc(44);
          h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
          h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(r.rate, 24);
          h.writeUInt32LE(r.rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
          wav = Buffer.concat([h, pcm]).toString("base64");
        }
        break;
      } catch (e) {
        out[m] = { ok: false, ms: Date.now() - t, error: String((e as Error).message).slice(0, 400) };
      }
    }
    let stt: unknown = null;
    if (wav) {
      const t = Date.now();
      try {
        stt = { ok: true, ms: Date.now() - t, text: await transcribe(wav, ["다음", "이전", "다시"]) };
      } catch (e) {
        stt = { ok: false, error: String((e as Error).message).slice(0, 400) };
      }
    }
    return Response.json({ tts: out, stt, trace: aiTrace.slice(-8) });
  }

  // 건물 이름과 번지: TMAP 역지오코딩과 상가정보의 건물 칸
  if (url.searchParams.get("addr")) {
    const [rev, rev2, shops] = await Promise.all([
      probe(() => reverseGeocode(NEAR.lat, NEAR.lng)),
      probe(() => reverseGeocode(DAEJEON_STATION.lat, DAEJEON_STATION.lng)),
      probe(async () => rankForLandmark(await storesNear(NEAR.lat, NEAR.lng, 60, 40), 5)),
    ]);
    return Response.json({ rev, rev2, shops });
  }

  if (url.searchParams.get("plan")) {
    const r = await planRoute(
      new Request("http://local/api/plan-route", {
        method: "POST",
        headers: { "content-type": "application/json", "x-device-id": "health-check" },
        body: JSON.stringify({ start: NEAR, end: { ...DAEJEON_STATION, name: "대전역" } }),
      }),
    );
    return Response.json({ status: r.status, plan: await r.json() });
  }

  const [places, route, stores, gemini, geminiLite] = await Promise.all([
    probe(async () => {
      const r = await searchPlaces("대전역", DAEJEON_STATION.lat, DAEJEON_STATION.lng);
      return { count: r.length, first: r.slice(0, 3) };
    }),
    probe(async () => {
      const r = await pedestrianRoute(NEAR, { ...DAEJEON_STATION, name: "대전역" });
      return { distance: r.totalDistance, time: r.totalTime, trackPoints: r.track.length, points: r.points.map((p) => [p.action, p.crossing, p.description, p.nearPoiName]) };
    }),
    probe(async () => {
      const r = await storesNear(NEAR.lat, NEAR.lng, 80, 80);
      return { count: r.length, ranked: rankForLandmark(r, 6) };
    }),
    probe(async () => (await askAI("JSON으로만 답한다.", [], '{"ok":true}를 그대로 출력해.')).slice(0, 200)),
    probe(async () => (await askAI("JSON으로만 답한다.", [], '{"ok":true}를 그대로 출력해.', { lite: true })).slice(0, 200)),
  ]);
  return Response.json({ keys, places, route, stores, gemini, geminiLite });
}
