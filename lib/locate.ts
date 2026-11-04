"use client";

// 지금 위치를 새로 잡는다. 휴대폰이 예전에 잡아 둔 위치(몇 분 전, 다른 곳)를 그대로 쓰면
// 출발지가 엉뚱한 곳이 된다. 몇 초 동안 위치를 받으며 가장 정확한 값을 고르고, 충분히 정확해지면 바로 끝낸다.

export type Fix = { lat: number; lng: number; accuracy: number };

export const GOOD_FIX_M = 25; // 이만큼 정확하면 바로 쓴다
export const POOR_FIX_M = 60; // 이보다 나쁘면 화면에 알리고 다시 잡기를 권한다

export function freshFix(maxMs = 8000): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("이 기기에서는 위치를 쓸 수 없어요."));
    let best: Fix | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(id);
      clearTimeout(timer);
      if (best) resolve(best);
      else reject(new Error("지금 위치를 찾지 못했어요. 위치 권한이 켜져 있는지 확인해 주세요."));
    };
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) };
        // 오래된 위치는 버린다 (휴대폰이 캐시해 둔 값)
        if (Date.now() - p.timestamp > 15000) return;
        if (!best || fix.accuracy < best.accuracy) best = fix;
        if (fix.accuracy <= GOOD_FIX_M) finish();
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          done = true;
          navigator.geolocation.clearWatch(id);
          clearTimeout(timer);
          reject(new Error("위치 권한이 꺼져 있어요. 설정에서 위치를 허용해 주세요."));
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxMs },
    );
    const timer = setTimeout(finish, maxMs);
  });
}
