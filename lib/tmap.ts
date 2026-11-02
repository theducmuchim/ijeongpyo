import "server-only";
import type { Action, Place } from "@/types";

// TMAP: 장소 검색(도착지 찾기)과 보행자 경로. 키는 서버 환경변수에만 둔다.
// 응답 칸 이름은 공개된 예제(보행자 경로: turnType, pointType, description, nearPoiName, totalDistance, totalTime)로 확인했다.
// 장소 검색 응답(searchPoiInfo.pois.poi)은 확인하지 못해서, 몇 가지 모양을 모두 받아 준다.
const KEY = process.env.TMAP_APP_KEY;
const BASE = "https://apis.openapi.sk.com/tmap";
export const hasTmap = () => !!KEY;

type Json = Record<string, unknown>;
const num = (v: unknown) => (v === undefined || v === null || v === "" ? NaN : Number(v));
const str = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));
// 도착 지점 nearPoiName은 보낸 이름이 인코딩된 채로 돌아온다 ("%EB%8C%80...")
const decode = (s: string) => {
  if (!/%[0-9A-F]{2}/i.test(s)) return s;
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// 실제 응답을 보니 꺾는 곳과 횡단보도가 20m 간격으로 붙어 나오는 일이 많다.
// 카드가 너무 촘촘하면 자동 넘김(30m)이 꼬이고 읽기도 바쁘다. 횡단보도가 낀 두 지점이 가까우면 한 장으로 합친다.
export const MERGE_M = 25;
function mergeClose(points: TurnPoint[]): TurnPoint[] {
  const out: TurnPoint[] = [];
  for (const p of points) {
    const prev = out.at(-1);
    const oneIsCrossing = prev && ((prev.action === "straight" && prev.crossing) || (p.action === "straight" && p.crossing));
    if (prev && p.action !== "arrive" && oneIsCrossing && meters(prev, p) < MERGE_M) {
      out[out.length - 1] = {
        ...prev, // 먼저 닿는 자리를 카드 위치로 둔다
        action: prev.action === "straight" ? p.action : prev.action,
        crossing: true,
        description: `${prev.description} / ${p.description}`,
        nearPoiName: prev.nearPoiName || p.nearPoiName,
      };
      continue;
    }
    out.push(p);
  }
  return out;
}

export async function searchPlaces(q: string, lat?: number, lng?: number): Promise<Place[]> {
  const p = new URLSearchParams({ version: "1", searchKeyword: q, count: "8", reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO" });
  if (lat !== undefined && lng !== undefined) {
    p.set("centerLat", String(lat));
    p.set("centerLon", String(lng));
  }
  const res = await fetch(`${BASE}/pois?${p}`, { headers: { appKey: KEY!, Accept: "application/json" }, cache: "no-store" });
  if (res.status === 204) return []; // 결과 없음
  if (!res.ok) throw new Error(`TMAP 장소 검색 오류 ${res.status}`);
  const j = (await res.json()) as Json;
  const info = (j.searchPoiInfo ?? j) as Json;
  const pois = ((info.pois as Json)?.poi ?? info.pois ?? []) as Json[];
  return (Array.isArray(pois) ? pois : [])
    .map((poi) => ({
      name: str(poi.name),
      address: [poi.upperAddrName, poi.middleAddrName, poi.lowerAddrName, poi.detailAddrName, poi.roadName].map(str).filter(Boolean).join(" "),
      lat: num(poi.frontLat ?? poi.noorLat ?? poi.lat),
      lng: num(poi.frontLon ?? poi.noorLon ?? poi.lon),
    }))
    .filter((x) => x.name && Number.isFinite(x.lat) && Number.isFinite(x.lng));
}

export type TurnPoint = {
  lat: number;
  lng: number;
  action: Action;
  crossing: boolean; // 횡단보도를 건너는 지점
  description: string; // TMAP 안내 문장 (예: "좌회전 후 월드컵로를 따라 223m 이동")
  nearPoiName: string;
};

export type WalkRoute = { points: TurnPoint[]; track: [number, number][]; totalDistance: number; totalTime: number };

// turnType 중 예제로 확인한 값: 200 출발, 201 도착, 12 좌회전, 13 우회전, 211 횡단보도.
// 나머지는 안내 문장의 낱말(좌회전/우회전/횡단보도)로 함께 판단한다.
function classify(turnType: number, description: string): { action: Action; crossing: boolean } | "start" | null {
  if (turnType === 200) return "start";
  if (turnType === 201) return { action: "arrive", crossing: false };
  const crossing = (turnType >= 211 && turnType <= 217) || /횡단보도/.test(description);
  if ([12, 16, 17].includes(turnType) || /좌회전|왼쪽/.test(description)) return { action: "left", crossing };
  if ([13, 18, 19].includes(turnType) || /우회전|오른쪽/.test(description)) return { action: "right", crossing };
  if (crossing) return { action: "straight", crossing: true };
  return null; // 직진 등: 카드로 만들지 않는다
}

export async function pedestrianRoute(start: { lat: number; lng: number }, end: { lat: number; lng: number; name: string }): Promise<WalkRoute> {
  const res = await fetch(`${BASE}/routes/pedestrian?version=1`, {
    method: "POST",
    headers: { appKey: KEY!, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      startX: String(start.lng),
      startY: String(start.lat),
      endX: String(end.lng),
      endY: String(end.lat),
      startName: encodeURIComponent("출발"),
      endName: encodeURIComponent(end.name || "도착"),
      reqCoordType: "WGS84GEO",
      resCoordType: "WGS84GEO",
      searchOption: "0",
      sort: "index",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`TMAP 경로 오류 ${res.status}`);
  const j = (await res.json()) as { features?: { geometry?: { type?: string; coordinates?: unknown }; properties?: Json }[] };
  const features = j.features ?? [];
  const points: TurnPoint[] = [];
  const track: [number, number][] = [];
  let totalDistance = 0;
  let totalTime = 0;
  for (const f of features) {
    const g = f.geometry ?? {};
    const pr = f.properties ?? {};
    if (pr.totalDistance !== undefined) totalDistance = num(pr.totalDistance) || totalDistance;
    if (pr.totalTime !== undefined) totalTime = num(pr.totalTime) || totalTime;
    if (g.type === "LineString" && Array.isArray(g.coordinates)) {
      for (const c of g.coordinates as number[][]) track.push([Number(c[0]), Number(c[1])]);
    } else if (g.type === "Point" && Array.isArray(g.coordinates)) {
      const [lng, lat] = (g.coordinates as number[]).map(Number);
      const description = str(pr.description);
      const kind = classify(num(pr.turnType), description);
      if (!kind || kind === "start") continue;
      points.push({ lat, lng, action: kind.action, crossing: kind.crossing, description, nearPoiName: decode(str(pr.nearPoiName)) });
    }
  }
  if (points.length === 0 || points.at(-1)!.action !== "arrive") {
    points.push({ lat: end.lat, lng: end.lng, action: "arrive", crossing: false, description: "도착", nearPoiName: end.name });
  }
  return { points: mergeClose(points), track, totalDistance, totalTime };
}
