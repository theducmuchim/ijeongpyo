"use client";

import { useEffect, useState } from "react";
import { AppBar } from "@/components/ui";
import { db } from "@/lib/db";
import { saveJson } from "@/lib/download";
import { saveSettings, useSettings, type Settings } from "@/lib/settings";
import { clearEvents, exportPayload, loadEvents, summarize, type UsageSummary } from "@/lib/usageLog";
import type { Route } from "@/types";

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children?: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div className="text">
        <p className="body-large">{title}</p>
        <p className="body-medium muted">{desc}</p>
      </div>
      {children}
    </div>
  );
}

// 휴대폰 시간대 기준 날짜 (2026-11-02 꼴)
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("sv-SE") : "-");

// 시험 기간에 쓰는 부분: 사용 기록 보기·내보내기, 평가용 경로 내보내기 (설계서 11장)
function TestSection({ enabled, onToggle }: { enabled: boolean; onToggle: (v: boolean) => void }) {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [agree, setAgree] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    loadEvents().then((ev) => setSummary(summarize(ev)));
    db.routes.where("status").equals("ready").toArray().then(setRoutes);
  }, [reload]);

  async function exportLog() {
    await saveJson(`ijeongpyo-usage-${day(new Date().toISOString())}.json`, exportPayload(await loadEvents()));
  }

  async function clearLog() {
    if (!confirm("사용 기록을 모두 지울까요? 길과 사진은 지워지지 않아요.")) return;
    await clearEvents();
    setReload((n) => n + 1);
  }

  // 평가 도구(npm run eval)에 넣을 카드 글. 사진은 넣지 않는다.
  async function exportRoute(r: Route) {
    await saveJson(`route-${r.cards.length}cards-${r.id.slice(0, 6)}.json`, {
      name: r.name,
      exportedAt: new Date().toISOString(),
      cards: r.cards.map((c) => ({
        order: c.order,
        photoDescription: c.photoDescription,
        landmarkName: c.landmark.name,
        instruction: c.instruction,
      })),
    });
  }

  const rows: [string, string | number][] = summary
    ? [
        ["기록 기간", `${day(summary.firstAt)} ~ ${day(summary.lastAt)}`],
        ["걷기 시작", summary.walks],
        ["마지막 카드까지 간 횟수", summary.finished],
        ["카드를 손으로 넘긴 횟수", summary.manualNext],
        ["길 벗어남 알림", summary.offRoute],
        ["'길을 잃었어요' 누른 횟수", summary.lostOpen],
        ["사진으로 찾은 횟수", summary.lostFound],
        ["3번 찍어도 못 찾은 횟수", summary.lostGaveUp],
        ["찾을 때까지 찍은 사진(평균)", summary.avgPhotosToFind ?? "-"],
        ["보호자에게 위치 보낸 횟수", summary.guardianShare],
      ]
    : [];

  return (
    <>
      <p className="section-label label-large">시험 기간</p>
      <Row title="사용 기록 남기기" desc="'길을 잃었어요'를 몇 번 눌렀는지 같은 횟수만 이 휴대폰에 남겨요. 사진과 위치는 남기지 않아요.">
        <Switch label="사용 기록 남기기" checked={enabled} onChange={onToggle} />
      </Row>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 16px 12px" }}>
        <div className="surface-card" style={{ gap: 4 }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span className="body-medium muted">{k}</span>
              <span className="body-medium">{v}</span>
            </div>
          ))}
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }} className="body-medium">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 4 }} />
          <span>위 기록을 시험 진행자에게 보내는 데 동의해요. (길 이름, 사진, 위치는 들어가지 않아요)</span>
        </label>
        <div className="row">
          <button className="btn btn-outlined" onClick={clearLog}>
            기록 지우기
          </button>
          <button className="btn btn-filled" onClick={exportLog} disabled={!agree}>
            기록 내보내기
          </button>
        </div>
      </div>

      <Row title="평가용 경로 내보내기" desc="카드 글만 파일로 저장해요. 컴퓨터의 평가 도구에 넣어 AI 정답률을 잴 때 써요." />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 16px 12px" }}>
        {routes.length === 0 && <p className="body-medium muted">저장한 길이 아직 없어요.</p>}
        {routes.map((r) => (
          <button key={r.id} className="btn btn-tonal" onClick={() => exportRoute(r)}>
            {r.name} · 카드 {r.cards.length}장 내보내기
          </button>
        ))}
      </div>
    </>
  );
}

export default function SettingsPage() {
  const s = useSettings();
  if (!s) return <main className="screen" />;

  const set = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    saveSettings(next);
    if ("largeText" in patch) document.documentElement.dataset.large = String(next.largeText);
  };

  return (
    <main className="screen">
      <AppBar title="설정" back="/" />
      <div style={{ paddingBottom: 24 }}>
        <p className="section-label label-large">안내</p>
        <Row title="진동 안내" desc="다음 카드가 뜰 때 한 번 진동해요">
          <Switch label="진동 안내" checked={s.vibrate} onChange={(v) => set({ vibrate: v })} />
        </Row>
        <Row title="음성 안내" desc="카드 문장을 소리로 읽어 줘요">
          <Switch label="음성 안내" checked={s.voice} onChange={(v) => set({ voice: v })} />
        </Row>

        <p className="section-label label-large">보호자</p>
        <Row title="보호자에게 위치 보내기" desc="'길을 잃었어요' 화면에 버튼이 생겨요. 자동으로 보내지는 않아요.">
          <Switch label="보호자에게 위치 보내기" checked={s.guardianShare} onChange={(v) => set({ guardianShare: v })} />
        </Row>
        {s.guardianShare && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 16px 12px" }}>
            <input className="field" placeholder="보호자 이름 (예: 엄마)" value={s.guardianName} onChange={(e) => set({ guardianName: e.target.value })} />
            <input className="field" placeholder="보호자 전화번호" inputMode="tel" value={s.guardianPhone} onChange={(e) => set({ guardianPhone: e.target.value })} />
            <p className="label-medium muted">번호는 이 휴대폰에만 저장돼요. 비워 두면 공유 화면이 열려요.</p>
          </div>
        )}

        <p className="section-label label-large">보기</p>
        <Row title="글씨 크게" desc="모든 화면의 글씨를 조금 크게 보여 줘요">
          <Switch label="글씨 크게" checked={s.largeText} onChange={(v) => set({ largeText: v })} />
        </Row>

        <TestSection enabled={s.usageLog} onToggle={(v) => set({ usageLog: v })} />

        <div style={{ padding: "16px 16px 0" }}>
          <div className="surface-card">
            <p className="title-medium">사진은 어디로 가나요?</p>
            <p className="body-medium muted">
              길을 찾을 때만 구글 AI(Gemini)로 보내져 분석돼요. 무료 서비스라서 구글이 서비스 개선에 쓸 수 있어요. 얼굴이나 집 주소가
              나오지 않게 찍어 주세요. 사진과 다닌 길은 이 휴대폰에만 저장돼요.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
