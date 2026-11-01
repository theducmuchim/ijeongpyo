import { friendlyError, isMockMode } from "@/lib/ai";
import { checkLimit } from "@/lib/rateLimit";
import { FALLBACK, askWhereAmI, type CardText } from "@/lib/whereAmI";
import type { ImagePayload, WhereAmIResult } from "@/types";

export const maxDuration = 30;

type Body = { photos: ImagePayload[]; cards: CardText[]; lastCardOrder: number };

export async function POST(req: Request) {
  const deviceId = req.headers.get("x-device-id");
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "요청을 읽을 수 없어요" }, { status: 400 });
  }
  const photos = (body.photos ?? []).slice(0, 3);
  if (photos.length === 0) return Response.json({ error: "사진이 없어요" }, { status: 400 });
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
    const result = await askWhereAmI(photos, cards, last);
    delete result.fallback;
    return Response.json(result);
  } catch (e) {
    const { message, status } = friendlyError(e);
    return Response.json({ ...FALLBACK, reasonForUser: message }, { status });
  }
}
