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
