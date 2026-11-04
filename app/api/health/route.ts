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
      { order: 1, photoDescription: "왼쪽 건물에 노란 간판 'ABC-MART'와 그 위 검은 간판 '확실한 치과'. 옆 회색 건물에 흰 나이키 로고.", landmarkName: "노란 간판 ABC마트", instruction: "노란 간판 ABC마트를 지나 큰길을 따라 곧장 가세요" },
      { order: 2, photoDescription: "왼쪽 모퉁이 건물에 '대우당약국'과 '대우당건강' 간판. 오른쪽 아래에 횡단보도.", landmarkName: "대우당약국", instruction: "대우당약국 앞 횡단보도를 건너세요" },
      { order: 3, photoDescription: "왼쪽에 유리 지붕을 씌운 지하철 입구. 뒤 건물에 검은 간판 '정덕영비뇨기과'.", landmarkName: "지하철 입구", instruction: "지하철 입구를 지나 오른쪽으로 가세요" },
      { order: 4, photoDescription: "정면에 흰 지붕과 빨간 기둥이 있는 대전역 건물.", landmarkName: "대전역 빨간 기둥 건물", instruction: "빨간 기둥이 있는 대전역 건물이 보이면 도착이에요" },
    ];
    if (which === "cards") {
      const notes = ["ABC마트 지나 곧장", "대우당약국 앞 횡단보도 건너기", "지하철 입구에서 오른쪽", "대전역 도착"];
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
          card: { order: 1, photoDescription: cards[0].photoDescription, landmarkName: "노란 간판 ABC마트", side: "left", action: "straight", instruction: cards[0].instruction, userNote: "" },
          nextInstruction: cards[1].instruction,
        }),
      );
    }
  }

  // ?check=1: 체험용 사진(대우당약국 간판이 있는 로드뷰 사진)으로 사진 확인을 실제로 한 번 해 본다
  if (url.searchParams.get("check")) {
    const img = await fetch("https://ijeongpyo-one.vercel.app/demo/demo-2.jpg", { cache: "no-store" });
    const base64 = Buffer.from(await img.arrayBuffer()).toString("base64");
    const t = Date.now();
    const r = await checkLandmark(
      new Request("http://local/api/check-landmark", {
        method: "POST",
        headers: { "content-type": "application/json", "x-device-id": "health-check" },
        body: JSON.stringify({ photo: { base64, mediaType: "image/jpeg" }, expected: "대우당약국", candidates: ["대우당건강"], action: "straight", instruction: "대우당약국 앞 횡단보도를 건너세요" }),
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

  // ?near=위도,경도: 그 자리 반경 40m 상가정보 점포 목록 (데이터 신뢰도 점검용)
  if (url.searchParams.get("near")) {
    const [lat, lng] = url.searchParams.get("near")!.split(",").map(Number);
    const r = Number(url.searchParams.get("r") || 40);
    return Response.json(await probe(async () => {
      const list = await storesNear(lat, lng, r, 100);
      return { count: list.length, list: list.map((x) => ({ name: x.name, category: x.category, floor: x.floor, lat: x.lat, lng: x.lng, dist: x.dist, building: x.building, road: x.road })) };
    }));
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
        // plan=far: 대전역 근처 → 대전시청 (긴 길에서 카드가 20장을 넘는지)
        body: JSON.stringify(
          url.searchParams.get("plan") === "far"
            ? { start: NEAR, end: { lat: 36.3504, lng: 127.3846, name: "대전광역시청" } }
            : { start: NEAR, end: { ...DAEJEON_STATION, name: "대전역" } },
        ),
      }),
    );
    const t = Date.now();
    const plan = (await r.json()) as { cards?: { order: number; instruction: string; candidates: unknown[]; place?: unknown }[]; totalDistance?: number };
    if (url.searchParams.get("plan") === "far")
      return Response.json({
        status: r.status,
        ms: Date.now() - t,
        distance: plan.totalDistance,
        cards: plan.cards?.length,
        withLandmark: plan.cards?.filter((c) => c.candidates.length).length,
        withPlace: plan.cards?.filter((c) => c.place).length,
        sample: plan.cards?.map((c) => c.instruction),
        trace: aiTrace.slice(-8),
      });
    return Response.json({ status: r.status, plan });
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
