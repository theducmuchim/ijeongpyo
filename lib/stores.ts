import "server-only";
import { distanceM } from "@/lib/geo";
import type { Candidate } from "@/types";

// 소상공인시장진흥공단 상가(상권)정보 API: 반경 안의 가게 (상호명, 업종, 층, 좌표). 이용허락범위 제한 없음.
// 주소와 칸 이름은 공개 라이브러리(PublicDataReader)의 코드로 확인했다: sdsc2/storeListInRadius, radius·cx(경도)·cy(위도),
// 응답 칸 bizesNm(상호명), brchNm(지점명), indsMclsNm·indsSclsNm(업종), flrNo(층), lon, lat.
const KEY = process.env.DATA_GO_KR_KEY;
export const hasStores = () => !!KEY;

type Item = Record<string, unknown>;
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v)).trim();

// 공공데이터포털은 '인코딩 키'와 '디코딩 키'를 준다. 어느 쪽을 넣어도 되게 한다.
const keyParam = () => (KEY!.includes("%") ? KEY! : encodeURIComponent(KEY!));

export type NearStore = Candidate & { dist: number };

export async function storesNear(lat: number, lng: number, radius = 40, rows = 80): Promise<NearStore[]> {
  const url =
    `https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius?serviceKey=${keyParam()}` +
    `&pageNo=1&numOfRows=${rows}&radius=${radius}&cx=${lng}&cy=${lat}&type=json`;
  let res = await fetch(url, { cache: "no-store" });
  // 공공데이터포털은 한꺼번에 여러 번 부르면 429를 준다. 잠깐 쉬었다가 한 번 더.
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 700));
    res = await fetch(url, { cache: "no-store" });
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`상가정보 오류 ${res.status}`);
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text);
  } catch {
    // 키가 틀리면 JSON 대신 XML 오류문이 온다
    if (/SERVICE_KEY|등록되지 않은|SERVICE ERROR/i.test(text)) throw new Error("상가정보 키가 맞지 않아요");
    return [];
  }
  const header = ((j.header ?? (j.response as Item)?.header) ?? {}) as Item;
  if (s(header.resultCode) === "03") return []; // 결과 없음
  const body = ((j.body ?? (j.response as Item)?.body) ?? {}) as Item;
  const raw = (body.items as Item)?.item ?? body.items ?? [];
  const items = (Array.isArray(raw) ? raw : [raw]) as Item[];
  return items
    .map((it) => {
      const la = Number(it.lat);
      const lo = Number(it.lon);
      return {
        name: [s(it.bizesNm), s(it.brchNm)].filter(Boolean).join(" "),
        category: s(it.indsSclsNm) || s(it.indsMclsNm),
        floor: s(it.flrNo),
        lat: la,
        lng: lo,
        dist: Math.round(distanceM(lat, lng, la, lo)),
      };
    })
    .filter((x) => x.name && Number.isFinite(x.lat) && Number.isFinite(x.lng));
}

// 거리에서 잘 보이는 가게를 앞에 둔다: 1층(또는 층 정보 없음) → 가까운 순
export function rankForLandmark(list: NearStore[], limit = 6): NearStore[] {
  const ground = (f?: string) => !f || f === "1" || f === "1층";
  const seen = new Set<string>();
  return [...list]
    .sort((a, b) => Number(ground(b.floor)) - Number(ground(a.floor)) || a.dist - b.dist)
    .filter((x) => (seen.has(x.name) ? false : (seen.add(x.name), true)))
    .slice(0, limit);
}
