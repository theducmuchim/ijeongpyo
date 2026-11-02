import { mockPlace } from "@/lib/planMock";
import { hasTmap, reverseGeocode } from "@/lib/tmap";
import type { PlaceInfo } from "@/types";

export const maxDuration = 30;

// 갈림길 좌표마다 근처 건물 이름과 번지를 찾는다. 같이 걸으며 등록한 길과, 예전에 만든 길의 카드에 붙인다.
// AI를 쓰지 않아서 하루 사용 횟수를 줄이지 않는다.
const MAX = 25;

export async function POST(req: Request) {
  let points: { lat: number; lng: number }[];
  try {
    points = ((await req.json()) as { points?: { lat: number; lng: number }[] }).points ?? [];
  } catch {
    return Response.json({ error: "보낸 내용을 읽지 못했어요. 다시 해 주세요." }, { status: 400 });
  }
  points = points.filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng)).slice(0, MAX);
  if (!hasTmap()) return Response.json({ places: points.map((p) => mockPlace(p.lat, p.lng)), mock: true });

  const places: (PlaceInfo | null)[] = new Array(points.length).fill(null);
  for (let k = 0; k < points.length; k += 4) {
    await Promise.all(
      points.slice(k, k + 4).map(async (p, j) => {
        try {
          const pl = await reverseGeocode(p.lat, p.lng);
          places[k + j] = pl ? { ...pl, near: true } : null;
        } catch (e) {
          console.error("[near-address]", String((e as Error).message).slice(0, 200));
        }
      }),
    );
  }
  return Response.json({ places });
}
