import "server-only";
import type { Action, Place } from "@/types";
import type { NearStore } from "@/lib/stores";
import type { WalkRoute } from "@/lib/tmap";

// 키가 없을 때 쓰는 시험용 장소와 경로. 실제 장소가 아니다(체험하기와 같은 가게 이름).
const DEFAULT = { lat: 36.3504, lng: 127.3845 };

export function mockPlaces(q: string, lat?: number, lng?: number): Place[] {
  const c = lat !== undefined && lng !== undefined ? { lat, lng } : DEFAULT;
  const names = [`(시험) ${q || "한빛중학교"}`, "(시험) 한빛중학교 정문", "(시험) 온누리약국"];
  return names.map((name, i) => ({ name, address: "시험 모드 · 실제 장소가 아니에요", lat: c.lat + 0.004 + i * 0.001, lng: c.lng + 0.003 - i * 0.0015 }));
}

const SHOPS = [
  { name: "꽃집 초록뜰", category: "꽃집", building: "(시험) 한빛빌딩", road: "중앙로 12", jibun: "은행동 45-6" },
  { name: "온누리약국", category: "약국", building: "(시험) 새솔빌딩", road: "중앙로 30", jibun: "은행동 51" },
  { name: "하늘편의점", category: "편의점", road: "대종로 488", jibun: "은행동 60-2" },
  { name: "바삭빵집", category: "제과점", building: "(시험) 해들상가", road: "대종로 501", jibun: "선화동 12" },
  { name: "분식 한그릇", category: "분식", road: "중교로 7", jibun: "선화동 3-1" },
  { name: "새마을세탁소", category: "세탁소", building: "(시험) 푸른주택", road: "중교로 15", jibun: "선화동 8" },
];

// 출발지에서 도착지까지 'ㄹ'자로 꺾는 가짜 경로: 꺾는 곳 3군데 + 도착
export function mockRoute(start: { lat: number; lng: number }, end: { lat: number; lng: number; name: string }): WalkRoute {
  const mid = (t: number) => ({ lat: start.lat + (end.lat - start.lat) * t, lng: start.lng + (end.lng - start.lng) * t });
  const a = { lat: mid(0.3).lat, lng: start.lng };
  const b = { lat: a.lat, lng: mid(0.6).lng };
  const c = { lat: mid(0.8).lat, lng: b.lng };
  const actions: { p: { lat: number; lng: number }; action: Action; crossing: boolean; d: string }[] = [
    { p: a, action: "right", crossing: false, d: "우회전 후 이동" },
    { p: b, action: "left", crossing: false, d: "좌회전 후 이동" },
    { p: c, action: "straight", crossing: true, d: "횡단보도 건너기" },
    { p: end, action: "arrive", crossing: false, d: "도착" },
  ];
  const track: [number, number][] = [start, a, b, c, end].map((p) => [p.lng, p.lat]);
  const dist = Math.round(
    track.slice(1).reduce((sum, p, i) => sum + Math.hypot((p[0] - track[i][0]) * 90000, (p[1] - track[i][1]) * 111000), 0),
  );
  return {
    points: actions.map((x) => ({ lat: x.p.lat, lng: x.p.lng, action: x.action, crossing: x.crossing, description: x.d, nearPoiName: "" })),
    track,
    totalDistance: dist,
    totalTime: Math.round(dist / 1.1),
  };
}

export function mockStoresNear(lat: number, lng: number, i: number): NearStore[] {
  return [0, 1, 2].map((k) => {
    const shop = SHOPS[(i * 2 + k) % SHOPS.length];
    return { ...shop, floor: k === 2 ? "2" : "1", lat: lat + 0.0001 * (k + 1), lng: lng - 0.0001 * k, dist: 12 + k * 9 };
  });
}

// 시험 모드: 좌표만으로 건물 이름과 번지를 지어낸다
export function mockPlace(lat: number, lng: number) {
  const n = Math.abs(Math.round(lat * 10000 + lng * 10000)) % 90;
  return { building: n % 2 ? `(시험) 건물${n}` : undefined, road: `중앙로 ${n + 10}`, jibun: `은행동 ${n + 1}`, near: true };
}
