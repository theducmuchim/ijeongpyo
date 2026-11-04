// 거리 계산과 갈림길·이탈 감지. 숫자는 시작값이고, 실제로 걸어 보며 고친다.
export const NEXT_CARD_RADIUS_M = 30; // 다음 카드까지 30m 안이면 카드를 띄운다
export const BAD_ACCURACY_M = 50; // GPS 정확도가 50m보다 나쁘면 자동 넘김을 끈다
export const OFF_ROUTE_M = 50; // 등록 경로에서 50m 넘게 벗어나고
export const OFF_ROUTE_SECONDS = 20; // 20초 넘게 이어지면 "길이 헷갈리나요?"

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

// 두 좌표 사이 거리(m)
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 지금 위치에서 등록 때 걸은 길(점들)까지 가장 가까운 거리(m)
export function distanceToTrackM(lat: number, lng: number, track: [number, number][]) {
  if (track.length === 0) return 0;
  let best = Infinity;
  for (const [tLng, tLat] of track) {
    const d = distanceM(lat, lng, tLat, tLng);
    if (d < best) best = d;
  }
  return best;
}

// a에서 b로 가는 방향 (북쪽 0°, 시계 방향). 로드뷰를 걸어갈 쪽으로 돌려 둘 때 쓴다.
export function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/* ───────────── 걷는 방향 기준으로 길잡이가 어느 쪽에 있는지 ───────────── */

// 경로(점들)에서 이 좌표와 가장 가까운 점의 번호
export function nearestIndex(track: [number, number][], lat: number, lng: number): number {
  let best = 0;
  let bestD = Infinity;
  track.forEach(([tLng, tLat], i) => {
    const d = distanceM(lat, lng, tLat, tLng);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

// 경로를 따라 i번 점에서 앞(+) 또는 뒤(-)로 약 meters 떨어진 점
export function pointAlong(track: [number, number][], i: number, meters: number): { lat: number; lng: number } {
  const step = meters >= 0 ? 1 : -1;
  let left = Math.abs(meters);
  let k = i;
  while (k + step >= 0 && k + step < track.length && left > 0) {
    left -= distanceM(track[k][1], track[k][0], track[k + step][1], track[k + step][0]);
    k += step;
  }
  return { lat: track[k][1], lng: track[k][0] };
}

// 걷는 방향(heading)으로 볼 때 그 좌표가 어디에 있나: 정면 / 왼쪽 / 오른쪽 / 뒤(이미 지나옴)
export type RelSide = "ahead" | "left" | "right" | "behind";
export function relativeSide(fromLat: number, fromLng: number, heading: number, lat: number, lng: number): RelSide {
  const rel = ((bearingDeg(fromLat, fromLng, lat, lng) - heading + 540) % 360) - 180; // -180~180, 음수면 왼쪽
  if (Math.abs(rel) <= 25) return "ahead";
  if (Math.abs(rel) >= 155) return "behind";
  return rel < 0 ? "left" : "right";
}

// 좌표에서 경로 일부(i번 점 앞뒤 window m)까지 가장 가까운 거리. 가게가 실제로 걷는 길가에 있는지 볼 때 쓴다.
export function distanceToTrackNear(track: [number, number][], i: number, lat: number, lng: number, windowM = 60): number {
  let best = Infinity;
  const a = Math.max(0, i - 40);
  const b = Math.min(track.length - 1, i + 40);
  const [cLng, cLat] = track[i];
  for (let k = a; k < b; k++) {
    const [x1, y1] = track[k];
    const [x2, y2] = track[k + 1];
    if (distanceM(cLat, cLng, y1, x1) > windowM && distanceM(cLat, cLng, y2, x2) > windowM) continue;
    best = Math.min(best, pointToSegmentM(lat, lng, y1, x1, y2, x2));
  }
  return Number.isFinite(best) ? best : distanceM(lat, lng, cLat, cLng);
}

function pointToSegmentM(lat: number, lng: number, lat1: number, lng1: number, lat2: number, lng2: number) {
  // 좁은 범위라 평면으로 계산한다
  const kx = Math.cos(rad(lat)) * 111320;
  const ky = 110540;
  const px = (lng - lng1) * kx, py = (lat - lat1) * ky;
  const vx = (lng2 - lng1) * kx, vy = (lat2 - lat1) * ky;
  const len = vx * vx + vy * vy;
  const t = len ? Math.max(0, Math.min(1, (px * vx + py * vy) / len)) : 0;
  return Math.hypot(px - t * vx, py - t * vy);
}
