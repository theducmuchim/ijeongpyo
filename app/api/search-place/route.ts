import { mockPlaces } from "@/lib/planMock";
import { hasTmap, searchPlaces } from "@/lib/tmap";

// 처음 가는 길: 도착지 검색 (TMAP 장소 검색). AI는 쓰지 않는다.
export async function POST(req: Request) {
  let body: { q?: string; lat?: number; lng?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "보낸 내용을 읽지 못했어요. 다시 해 주세요." }, { status: 400 });
  }
  const q = (body.q ?? "").trim().slice(0, 60);
  if (!q) return Response.json({ error: "찾을 장소 이름을 적어 주세요." }, { status: 400 });
  if (!hasTmap()) return Response.json({ places: mockPlaces(q, body.lat, body.lng), mock: true });
  try {
    return Response.json({ places: await searchPlaces(q, body.lat, body.lng) });
  } catch (e) {
    console.error("[search-place]", String((e as Error).message ?? e).slice(0, 300));
    return Response.json({ error: "장소를 찾지 못했어요. 잠시 뒤 다시 해 주세요." }, { status: 502 });
  }
}
