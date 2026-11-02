"use client";

// 마이크·위치 권한을 앱이 먼저 설명하고 물어본 뒤에 휴대폰에 요청한다.
// 휴대폰 창이 갑자기 뜨면 무엇을 허용하는지 모르고 '허용 안 함'을 누르기 쉽고, 그러면 다시 켜기가 어렵다.

export type Perm = "mic" | "location";
export type PermState = "granted" | "denied" | "prompt";

const KEY = (p: Perm) => `ijeongpyo.perm.${p}`;
const remember = (p: Perm, s: PermState) => {
  try {
    localStorage.setItem(KEY(p), s);
  } catch {}
};

/** 지금 권한 상태. 브라우저가 알려 주지 않으면(아이폰 일부) 지난번 결과를 쓴다. */
export async function permState(p: Perm): Promise<PermState> {
  try {
    const r = await navigator.permissions.query({ name: (p === "mic" ? "microphone" : "geolocation") as PermissionName });
    if (r.state === "granted" || r.state === "denied" || r.state === "prompt") {
      // 아이폰 사파리는 매번 'prompt'라고 하는 일이 있어, 지난번에 허용했으면 허용으로 본다
      if (r.state === "prompt" && saved(p) === "granted") return "granted";
      return r.state;
    }
  } catch {}
  return saved(p);
}

function saved(p: Perm): PermState {
  try {
    const v = localStorage.getItem(KEY(p));
    return v === "granted" || v === "denied" ? v : "prompt";
  } catch {
    return "prompt";
  }
}

/** 휴대폰에 실제로 요청한다. 허용되면 true. */
export async function requestPerm(p: Perm): Promise<boolean> {
  if (p === "mic") {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      remember(p, "granted");
      return true;
    } catch (e) {
      if ((e as DOMException)?.name === "NotAllowedError") remember(p, "denied");
      return false;
    }
  }
  if (!("geolocation" in navigator)) return false;
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      () => {
        remember(p, "granted");
        resolve(true);
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          remember(p, "denied");
          resolve(false);
        } else {
          // 허용은 했는데 위치를 아직 못 잡은 경우 (실내 등)
          remember(p, "granted");
          resolve(true);
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    ),
  );
}

export const PERM_TEXT: Record<Perm, { title: string; body: string; ok: string; deniedTitle: string; denied: string }> = {
  mic: {
    title: "마이크를 쓸까요?",
    body: "말로 조작하려면 마이크가 필요해요. 버튼을 누르고 말할 때만 듣고, 말소리는 글자로 바꾸는 데만 써요. 다음에 뜨는 휴대폰 창에서 '허용'을 눌러 주세요.",
    ok: "마이크 허용하기",
    deniedTitle: "마이크가 꺼져 있어요",
    denied: "휴대폰 설정에서 이 브라우저(크롬, 사파리 등)의 마이크를 켜고, 이 화면을 다시 열어 주세요.",
  },
  location: {
    title: "위치를 쓸까요?",
    body: "지금 위치를 알면 갈림길에 가까워질 때 카드를 저절로 넘기고, 남은 거리를 알려 줘요. 위치는 이 휴대폰 안에서만 써요. 다음에 뜨는 휴대폰 창에서 '허용'을 눌러 주세요.",
    ok: "위치 허용하기",
    deniedTitle: "위치가 꺼져 있어요",
    denied: "휴대폰 설정에서 이 브라우저의 위치를 켜고, 이 화면을 다시 열어 주세요. 위치 없이도 카드를 직접 넘기며 걸을 수 있어요.",
  },
};
