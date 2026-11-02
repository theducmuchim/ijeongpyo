"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppBar, Icon, useConfirm } from "@/components/ui";
import { makeBackup, restoreBackup } from "@/lib/backup";
import { db } from "@/lib/db";
import { saveJson } from "@/lib/download";
import { saveSettings, useSettings, type Settings, type Theme } from "@/lib/settings";
import { toast } from "@/lib/toast";
import { clearEvents, exportPayload, loadEvents, summarize, type UsageSummary } from "@/lib/usageLog";
import { josa } from "@/lib/josa";
import type { Route } from "@/types";

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div className="text">
        <p className="body-large">{title}</p>
        {desc && <p className="body-medium muted">{desc}</p>}
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
  const [dialog, ask] = useConfirm();

  useEffect(() => {
    loadEvents().then((ev) => setSummary(summarize(ev)));
    db.routes.where("status").equals("ready").toArray().then(setRoutes);
  }, [reload]);

  async function exportLog() {
    if (await saveJson(`ijeongpyo-usage-${day(new Date().toISOString())}.json`, exportPayload(await loadEvents()))) {
      toast("사용 기록을 내보냈어요");
    }
  }

  async function clearLog() {
    const ok = await ask({ title: "사용 기록을 지울까요?", body: "길과 사진은 지워지지 않아요.", ok: "지우기", danger: true });
    if (!ok) return;
    await clearEvents();
    setReload((n) => n + 1);
    toast("사용 기록을 지웠어요");
  }

  // 평가 도구(npm run eval)에 넣을 카드 글. 사진은 넣지 않는다.
  async function exportRoute(r: Route) {
    const ok = await saveJson(`route-${r.cards.length}cards-${r.id.slice(0, 6)}.json`, {
      name: r.name,
      exportedAt: new Date().toISOString(),
      cards: r.cards.map((c) => ({
        order: c.order,
        photoDescription: c.photoDescription,
        landmarkName: c.landmark.name,
        instruction: c.instruction,
      })),
    });
    if (ok) toast(`${josa(r.name, "을/를")} 내보냈어요`);
  }

  const rows: [string, string | number][] = summary
    ? [
        ["기록 기간", `${day(summary.firstAt)} ~ ${day(summary.lastAt)}`],
        ["걷기 시작", summary.walks],
        ["도착까지 걸은 횟수", summary.finished],
        ["카드를 손으로 넘긴 횟수", summary.manualNext],
        ["길 벗어남 알림", summary.offRoute],
        ["'길을 잃었어요' 누른 횟수", summary.lostOpen],
        ["사진으로 찾은 횟수", summary.lostFound],
        ["3번 찍어도 못 찾은 횟수", summary.lostGaveUp],
        ["찾을 때까지 찍은 사진(평균)", summary.avgPhotosToFind ?? "-"],
        ["길잡이를 바꾼 횟수", summary.landmarkReplaced],
        ["처음 가는 길 초안 만든 횟수", summary.plansMade],
        ["처음 길에서 길잡이가 보인/안 보인 횟수", `${summary.landmarkSeen} / ${summary.landmarkMissing}`],
        ["도움 요청 화면 연 횟수", summary.helpCard],
        ["보호자에게 위치 보낸 횟수", summary.guardianShare],
      ]
    : [];

  return (
    <>
      <p className="section-label label-large">시험 기간</p>
      <Row title="사용 기록 남기기" desc="'길을 잃었어요'를 누른 횟수 같은 숫자만 이 휴대폰에 남겨요. 사진과 위치는 남기지 않아요.">
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
          <span>시험 진행자에게 이 기록을 보내는 데 동의해요. 길 이름, 사진, 위치는 들어가지 않아요.</span>
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

      <Row title="평가용 경로 내보내기" desc="카드 글만 파일로 저장해요. 평가 도구(npm run eval)에 넣을 때 써요." />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 16px 12px" }}>
        {routes.length === 0 && <p className="body-medium muted">저장한 길이 없어요.</p>}
        {routes.map((r) => (
          <button key={r.id} className="btn btn-tonal" onClick={() => exportRoute(r)}>
            {r.name} · 카드 {r.cards.length}장 내보내기
          </button>
        ))}
      </div>
      {dialog}
    </>
  );
}

// 휴대폰을 바꿔도 길이 사라지지 않게: 길과 사진을 파일 하나로 내보내고 다시 불러온다
function BackupSection() {
  const [busy, setBusy] = useState<"save" | "load" | null>(null);
  const [dialog, ask] = useConfirm();

  async function backup() {
    setBusy("save");
    try {
      const data = await makeBackup();
      if (data.routes.length === 0) {
        toast("저장한 길이 없어요");
        return;
      }
      const ok = await saveJson(`ijeongpyo-backup-${day(new Date().toISOString())}.json`, data);
      if (ok) toast(`길 ${data.routes.length}개를 백업했어요`);
    } finally {
      setBusy(null);
    }
  }

  async function restore(file: File) {
    const ok = await ask({
      title: "백업을 불러올까요?",
      body: "같은 길이 이미 있으면 백업한 내용으로 바뀌어요.",
      ok: "불러오기",
    });
    if (!ok) return;
    setBusy("load");
    try {
      const { added, replaced } = await restoreBackup(file);
      toast(replaced ? `길 ${added}개를 불러오고 ${replaced}개를 바꿨어요` : `길 ${added}개를 불러왔어요`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <p className="section-label label-large">백업</p>
      <Row
        title="길 백업"
        desc="휴대폰을 바꾸거나 브라우저 기록을 지우면 길이 사라져요."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 16px 12px" }}>
        <div className="row">
          <button className="btn btn-tonal" onClick={backup} disabled={busy !== null}>
            <Icon name="download" size={20} /> {busy === "save" ? "만드는 중…" : "백업하기"}
          </button>
          <label className={`btn btn-outlined${busy ? " disabled" : ""}`} htmlFor="restore-file" aria-disabled={busy !== null}>
            <Icon name="upload" size={20} /> {busy === "load" ? "불러오는 중…" : "불러오기"}
          </label>
          <input
            id="restore-file"
            className="hidden-input"
            type="file"
            accept="application/json,.json"
            disabled={busy !== null}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) restore(f);
            }}
          />
        </div>
        <p className="label-medium muted">백업 파일에는 사진과 다닌 길이 들어 있어요. 다른 사람에게 보내지 마세요.</p>
      </div>
      {dialog}
    </>
  );
}

const THEMES: { value: Theme; label: string; icon: "phone" | "light" | "dark" }[] = [
  { value: "auto", label: "휴대폰대로", icon: "phone" },
  { value: "light", label: "밝게", icon: "light" },
  { value: "dark", label: "어둡게", icon: "dark" },
];

export default function SettingsPage() {
  const s = useSettings();
  if (!s) return <main className="screen" />;

  const set = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    saveSettings(next);
  };

  return (
    <main className="screen">
      <AppBar title="설정" back="/" />
      <div style={{ paddingBottom: 24 }}>
        <p className="section-label label-large">안내</p>
        <Row title="진동 안내" desc="다음 카드가 뜨면 진동해요">
          <Switch label="진동 안내" checked={s.vibrate} onChange={(v) => set({ vibrate: v })} />
        </Row>
        <Row title="음성 안내" desc="카드 문장을 읽어 줘요">
          <Switch label="음성 안내" checked={s.voice} onChange={(v) => set({ voice: v })} />
        </Row>

        <p className="section-label label-large">보호자</p>
        <Row title="보호자에게 위치 보내기" desc="'길을 잃었어요' 화면에 버튼이 생겨요. 저절로 보내지는 않아요.">
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
        <Row title="화면 밝기" />
        <div className="seg" role="group" aria-label="화면 밝기">
          {THEMES.map((t) => (
            <button key={t.value} aria-pressed={s.theme === t.value} onClick={() => set({ theme: t.value })}>
              {s.theme === t.value ? <Icon name="check" size={18} /> : <Icon name={t.icon} size={18} />} {t.label}
            </button>
          ))}
        </div>
        <Row title="글씨 크게" desc="모든 화면의 글씨를 키워요">
          <Switch label="글씨 크게" checked={s.largeText} onChange={(v) => set({ largeText: v })} />
        </Row>

        <p className="section-label label-large">도움말</p>
        <Link href="/guide" className="setting-row pressable">
          <div className="text">
            <p className="body-large">사용 설명서</p>
            <p className="body-medium muted">기능별 쓰는 법과 자주 묻는 질문</p>
          </div>
          <Icon name="forward" />
        </Link>
        <Link href="/demo" className="setting-row pressable">
          <div className="text">
            <p className="body-large">체험해 보기</p>
            <p className="body-medium muted">예시 사진으로 등록부터 도착까지</p>
          </div>
          <Icon name="forward" />
        </Link>

        <BackupSection />
        <TestSection enabled={s.usageLog} onToggle={(v) => set({ usageLog: v })} />

        <div style={{ padding: "16px 16px 0" }}>
          <div className="surface-card">
            <p className="title-medium">사진 처리</p>
            <p className="body-medium muted">
              길을 등록하거나 찾을 때 사진을 구글 Gemini로 보내요. 무료 서비스라 구글이 서비스 개선에 쓸 수 있어요. 얼굴, 집 주소,
              문패가 찍히지 않게 해 주세요. 사진과 길 기록은 이 휴대폰에만 저장돼요.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
