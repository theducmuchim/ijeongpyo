import { friendlyError, isMockMode } from "@/lib/ai";
import { distanceM } from "@/lib/geo";
import { hasStores, rankForLandmark, storesNear } from "@/lib/stores";
import { checkLimit } from "@/lib/rateLimit";
import { FALLBACK, askWhereAmI, type CardText } from "@/lib/whereAmI";
import type { ImagePayload, WhereAmIResult } from "@/types";

export const maxDuration = 60;

type Body = {
  photos: ImagePayload[];
  cards: CardText[];
  lastCardOrder: number;
  // offTrackM: 휴대폰이 계산한, 지금 위치에서 걷던 길(경로 선)까지 거리. accuracy: GPS 오차(m)
  gps?: { lat: number; lng: number; accuracy?: number; offTrackM?: number } | null;
  said?: string;
};

// 사진만 보고는 '비슷하게 생긴 다른 골목'을 경로 위라고 확신하는 일이 있었다(로드뷰 평가 사진에서 경로 밖 10장 중 5장).
// GPS가 걷던 길에서 확실히 멀면 AI 답과 상관없이 '길에서 벗어남'으로 알린다. 오차만큼 여유를 둔다.
const OFF_TRACK_M = 60;
const FAR_FROM_CARDS_M = 250; // 경로 선이 없을 때: 모든 카드 지점에서 이만큼 넘게 멀면

export async function POST(req: Request) {
  const deviceId = req.headers.get("x-device-id");
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "보낸 내용을 읽지 못했어요. 다시 해 주세요." }, { status: 400 });
  }
  const photos = (body.photos ?? []).slice(0, 3);
  if (photos.length === 0) return Response.json({ error: "사진이 들어오지 않았어요. 다시 찍어 주세요." }, { status: 400 });
  const cards = body.cards ?? [];
  const last = body.lastCardOrder ?? 0;

  // 시험 모드: 사진 1장이면 한 장 더 요청하고, 2장부터는 마지막 카드 다음으로 안내한다.
  if (isMockMode()) {
    const next = cards.find((c) => c.order === last + 1) ?? cards.find((c) => c.order === last);
    const result: WhereAmIResult =
      photos.length < 2
        ? { ...FALLBACK, confidence: 0.4, askPhoto: "(시험 모드) 오른쪽도 한 장 찍어 주세요", nextStep: "한 장 더 찍어 주세요", mock: true }
        : {
            status: "on_route",
            confidence: 0.8,
            seenLandmarks: [next?.landmarkName ?? "길잡이"],
            matchedCardOrder: next?.order ?? null,
            nextStep: next?.instruction ?? "마지막으로 지나간 카드 장소로 돌아가세요",
            askPhoto: null,
            reasonForUser: `(시험 모드) ${next?.order ?? last}번 카드 근처라고 가정한 답이에요`,
            mock: true,
          };
    return Response.json(result);
  }

  if (!(await checkLimit(deviceId))) {
    return Response.json({ error: "오늘 쓸 수 있는 횟수를 다 썼어요. 마지막 카드 장소로 돌아가세요." }, { status: 429 });
  }

  try {
    // GPS가 있으면 각 카드 지점까지 거리와, 지금 위치 주변 가게를 함께 보낸다 (사진 없는 처음 가는 길에서 특히 필요)
    const lines: string[] = [];
    const g = body.gps;
    if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) {
      const d = cards
        .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng))
        .map((c) => `${c.order}번 ${Math.round(distanceM(g.lat, g.lng, c.lat!, c.lng!))}m`);
      if (d.length) lines.push(`지금 GPS 위치에서 각 카드 지점까지 거리: ${d.join(", ")}`);
      if (hasStores()) {
        try {
          const near = rankForLandmark(await storesNear(g.lat, g.lng, 100, 120), 15);
          if (near.length) lines.push(`지금 위치 반경 100m 가게: ${near.map((s) => `${s.name}(${s.dist}m)`).join(", ")}`);
        } catch (e) {
          console.error("[where-am-i] 상가정보", String((e as Error).message).slice(0, 200));
        }
      }
    }
    // 사용자가 말로 한 설명 ("편의점 앞인데 어디로 가요?"). 사진보다 앞세우지 않는다.
    const said = typeof body.said === "string" ? body.said.trim().slice(0, 200) : "";
    if (said) lines.push(`사용자가 말로 한 설명(참고만 하고, 사진과 다르면 사진을 따른다): "${said}"`);
    let offBy: number | null = null;
    if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) {
      const slack = Math.min(Number(g.accuracy) || 30, 60);
      if (Number.isFinite(g.offTrackM) && g.offTrackM! > OFF_TRACK_M + slack) offBy = g.offTrackM!;
      else if (!Number.isFinite(g.offTrackM)) {
        const ds = cards.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng)).map((c) => distanceM(g.lat, g.lng, c.lat!, c.lng!));
        if (ds.length && Math.min(...ds) > FAR_FROM_CARDS_M + slack) offBy = Math.min(...ds);
      }
      if (offBy !== null) lines.push(`지금 GPS 위치가 걷던 길에서 약 ${Math.round(offBy)}m 떨어져 있다. 경로 밖일 가능성이 높다.`);
    }
    const result = await askWhereAmI(photos, cards, last, lines.join("\n"));
    delete result.fallback;
    if (offBy !== null) {
      const m = Math.round(offBy / 10) * 10;
      return Response.json({
        ...result,
        status: "off_route",
        matchedCardOrder: null,
        confidence: Math.max(result.confidence, 0.7),
        askPhoto: null,
        nextStep: "마지막으로 지나간 카드 장소로 돌아가세요",
        reasonForUser: `지금 위치가 걷던 길에서 약 ${m}m 떨어져 있어요`,
        gpsOffRoute: true,
      });
    }
    return Response.json(result);
  } catch (e) {
    const { message, status } = friendlyError(e);
    return Response.json({ ...FALLBACK, reasonForUser: message }, { status });
  }
}
