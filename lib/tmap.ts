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
      points.push({ lat, lng, action: kind.action, crossing: kind.crossing, description, nearPoiName: str(pr.nearPoiName) });
    }
  }
  if (points.length === 0 || points.at(-1)!.action !== "arrive") {
    points.push({ lat: end.lat, lng: end.lng, action: "arrive", crossing: false, description: "도착", nearPoiName: end.name });
  }
  return { points, track, totalDistance, totalTime };
}
