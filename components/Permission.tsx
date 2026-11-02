"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ui";
import { type Perm, type PermState, PERM_TEXT, permState, requestPerm } from "@/lib/permissions";

/** 권한이 필요할 때 부른다: 앱 창으로 먼저 설명하고, '허용하기'를 누르면 휴대폰에 요청한다. */
export function usePermission(): [React.ReactNode, (p: Perm) => Promise<{ ok: boolean; fresh: boolean }>] {
  const [dialog, ask] = useConfirm();
  const ensure = useCallback(
    async (p: Perm) => {
      const st = await permState(p);
      if (st === "granted") return { ok: true, fresh: false };
      const t = PERM_TEXT[p];
      if (st === "denied") {
        // 막혀 있어도 한 번은 다시 요청해 본다(설정을 바꾸고 돌아온 경우). 그래도 안 되면 켜는 곳을 알려 준다.
        if (await requestPerm(p)) return { ok: true, fresh: true };
        await ask({ title: t.deniedTitle, body: t.denied, ok: "확인" });
        return { ok: false, fresh: false };
      }
      if (!(await ask({ title: t.title, body: t.body, ok: t.ok, cancel: "다음에" }))) return { ok: false, fresh: false };
      const ok = await requestPerm(p);
      if (!ok) await ask({ title: t.deniedTitle, body: t.denied, ok: "확인" });
      return { ok, fresh: true };
    },
    [ask],
  );
  return [dialog, ensure];
}

/** 화면에서 권한 상태를 보여 줄 때 (위치 허용 카드 등) */
export function usePermState(p: Perm): [PermState | null, (s: PermState) => void] {
  const [st, setSt] = useState<PermState | null>(null);
  useEffect(() => {
    let alive = true;
    permState(p).then((s) => alive && setSt(s));
    return () => {
      alive = false;
    };
  }, [p]);
  return [st, setSt];
}
