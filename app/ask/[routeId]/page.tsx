"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { db } from "@/lib/db";
import { josa } from "@/lib/josa";
import { useSettings } from "@/lib/settings";
import { logEvent } from "@/lib/usageLog";
import { DictateButton, useScreenSpeech } from "@/components/Voice";
import { speak } from "@/lib/voice";
import type { Route } from "@/types";

// 도움 요청 화면: 지나가는 사람에게 휴대폰을 보여 주고 방향을 물어본다. AI도 인터넷도 쓰지 않는다.
export default function AskPage() {
  const { routeId } = useParams<{ routeId: string }>();
  const router = useRouter();
  const settings = useSettings();
  const [route, setRoute] = useState<Route | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [dest, setDest] = useState("");
  const logged = useRef(false);

  useEffect(() => {
    db.routes.get(routeId).then((r) => {
      setRoute(r ?? null);
      setDest(r?.destName ?? "");
      if (r && !r.destName) setEditing(true); // 도착지를 아직 모르면 먼저 적게 한다
      if (r && !logged.current) {
        logged.current = true;
        logEvent(r.id, "help_card");
      }
    });
  }, [routeId]);

  async function saveDest() {
    if (!route || !dest.trim()) return;
    await db.routes.update(route.id, { destName: dest.trim() });
    setRoute({ ...route, destName: dest.trim() });
    setEditing(false);
  }

  const name = route?.destName;
  const askText = `제가 길을 잘 못 찾아요. ${name ? josa(name, "으로/로") : "가려는 곳으로"} 가는 방향을 손으로 가리켜 주세요. 고맙습니다.`;
  useScreenSpeech(route && !editing ? askText : null);
  if (route === undefined) return <main className="screen ask" />;

  return (
    <main className="screen ask">
      <div className="ask-top">
        <button className="icon-btn" aria-label="돌아가기" onClick={() => router.back()}>
          <Icon name="back" />
        </button>
        {!editing && name && (
          <button className="icon-btn" aria-label="도착지 고치기" onClick={() => setEditing(true)}>
            <Icon name="edit" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="body" style={{ justifyContent: "center" }}>
          <p className="headline-small">어디로 가고 있나요?</p>
          <p className="body-medium muted">지나가는 사람이 알아볼 수 있는 이름으로 적어 주세요. 예: 한빛중학교 정문, 서대전역 2번 출구</p>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input className="field body-large" style={{ flex: 1 }} value={dest} onChange={(e) => setDest(e.target.value)} placeholder="도착지 이름" autoFocus />
            <DictateButton label="도착지를 말로 적기" onText={setDest} />
          </div>
          <button className="btn btn-filled btn-large" onClick={saveDest} disabled={!dest.trim()}>
            저장하고 보여 주기
          </button>
        </div>
      ) : (
        <div className="ask-card" role="note">
          <p className="ask-lead">제가 길을 잘 못 찾아요.</p>
          <p className="ask-main">
            <b>{name ? josa(name, "으로/로") : "가려는 곳으로"}</b> 가는 방향을 손으로 가리켜 주세요.
          </p>
          <p className="ask-thanks">고맙습니다.</p>
        </div>
      )}

      {!editing && (
        <div className="body" style={{ flex: "none" }}>
          <button className="btn btn-filled btn-large" onClick={() => speak(askText, { force: true })}>
            <Icon name="volume" size={24} /> 소리로 들려주기
          </button>
          {settings?.guardianPhone && (
            <a className="btn btn-tonal" href={`tel:${settings.guardianPhone}`}>
              {settings.guardianName ? `${settings.guardianName}에게` : "보호자에게"} 전화하기
            </a>
          )}
          <p className="label-medium muted center">이 화면을 지나가는 사람에게 보여 주세요.</p>
        </div>
      )}
    </main>
  );
}
