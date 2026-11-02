import { friendlyError, isMockMode } from "@/lib/ai";
import { distanceM } from "@/lib/geo";
import { hasStores, rankForLandmark, storesNear } from "@/lib/stores";
import { checkLimit } from "@/lib/rateLimit";
import { FALLBACK, askWhereAmI, type CardText } from "@/lib/whereAmI";
import type { ImagePayload, WhereAmIResult } from "@/types";

export const maxDuration = 60;

type Body = { photos: ImagePayload[]; cards: CardText[]; lastCardOrder: number; gps?: { lat: number; lng: number } | null };

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
    const result = await askWhereAmI(photos, cards, last, lines.join("\n"));
    delete result.fallback;
    return Response.json(result);
  } catch (e) {
    const { message, status } = friendlyError(e);
    return Response.json({ ...FALLBACK, reasonForUser: message }, { status });
  }
}
