"use client";

import { useEffect, useRef, useState } from "react";
import { usePermission, usePermState } from "@/components/Permission";
import { Icon } from "@/components/ui";
import { useSettings } from "@/lib/settings";
import { toast } from "@/lib/toast";
import { type Command, canListen, canListenAlways, finishListening, listenAlways, listenOnce, matchCommand, speak, voiceLog } from "@/lib/voice";

type Props = {
  commands: Command[];
  onCommand: (id: string, heard: string) => void;
  /** 명령이 아닌 말을 받는 곳 (예: 홈에서 길 이름, 도착지). 없으면 "알아듣지 못했어요" */
  onOther?: (heard: string) => void;
  /** 이 화면에서는 '걷는 동안 계속 듣기'를 쓸 수 있다 */
  allowAlways?: boolean;
  /** 말할 수 있는 예 (화면에 작게 보여 줌) */
  examples: string;
  label?: string;
};

/** 화면마다 붙이는 '말로 하기' 버튼. 설정에 따라 버튼을 누를 때만 듣거나, 계속 듣는다. */
export function VoiceControl({ commands, onCommand, onOther, allowAlways, examples, label = "말로 하기" }: Props) {
  const s = useSettings();
  const [state, setState] = useState<"idle" | "listening" | "thinking" | "on" | "off" | "denied">("idle");
  const [heard, setHeard] = useState<string | null>(null);
  const [did, setDid] = useState<string | null>(null); // 알아들은 뒤 한 일
  const [permDialog, ensure] = usePermission();
  const [mic, setMic] = usePermState("mic");
  // 계속 듣는 동안 화면이 바뀌어도 최신 명령 목록으로 맞추게 ref에 둔다
  const latest = useRef({ commands, onCommand, onOther, examples });
  useEffect(() => {
    latest.current = { commands, onCommand, onOther, examples };
  });
  const [paused, setPaused] = useState(false);
  // 계속 듣기는 브라우저 음성 인식이 될 때만. 안 되는 브라우저(아이폰·아이패드의 크롬 등)는 버튼으로 듣는다.
  const wantsAlways = !!allowAlways && s?.listenMode === "always" && canListenAlways();
  const always = wantsAlways && !paused && mic === "granted";

  function handle(alts: string[], fromAlways: boolean) {
    const { commands: cmds, onCommand: run, onOther: other, examples: ex } = latest.current;
    const text = alts[0] ?? "";
    setHeard(text);
    const c = matchCommand(alts, cmds);
    // 알아들은 뒤에 한 일을 화면과 기록에 남긴다. 한 일이 실패하면 그것도 알린다 (조용히 멈추지 않게).
    try {
      if (c) {
        run(c.id, text);
        setDid(c.label ?? "했어요");
        voiceLog({ heard: text, did: c.label ?? c.id });
        return;
      }
      if (other) {
        other(text);
        setDid(null);
        voiceLog({ heard: text, did: "말한 내용으로 처리" });
        return;
      }
    } catch (e) {
      setDid("하지 못했어요");
      voiceLog({
        heard: text,
        error: String((e as Error)?.message ?? e).slice(0, 120),
      });
      toast("알아듣긴 했지만 실행하지 못했어요. 버튼을 직접 눌러 주세요.");
      return;
    }
    setDid("맞는 말이 없어요");
    voiceLog({ heard: text, did: "맞는 말 없음" });
    // 계속 듣기에서는 옆 사람 말소리도 들어오니, 모르는 말은 조용히 넘긴다
    if (!fromAlways) speak(`알아듣지 못했어요. ${ex}처럼 말해 주세요.`, { force: true });
  }

  useEffect(() => {
    if (!always) return;
    return listenAlways((alts) => handle(alts, true), setState);
    // handle은 ref로 최신 값을 읽으므로 always가 바뀔 때만 다시 건다
  }, [always]);

  if (!s || !canListen()) return null;

  async function once() {
    // 녹음 중에 다시 누르면 바로 멈추고 보낸다
    if (state === "listening") return finishListening();
    if (state === "thinking") return;
    // 마이크 권한을 먼저 설명하고 물어본다
    const perm = await ensure("mic");
    setMic(perm.ok ? "granted" : "denied");
    if (!perm.ok) return;
    setState("listening");
    setHeard(null);
    setDid(null);
    if (perm.fresh) speak("이제 말해 주세요.", { force: true });
    try {
      const hints = latest.current.commands.filter((c) => c.when !== false).flatMap((c) => c.say);
      handle(
        await listenOnce({
          onInterim: setHeard,
          onPhase: setState,
          hints,
          fresh: perm.fresh,
        }),
        false,
      );
    } catch (e) {
      const msg = (e as Error).message;
      voiceLog({ error: msg });
      toast(msg);
      speak(msg, { force: true });
    } finally {
      setState("idle");
    }
  }

  const result = heard ? `들은 말: ${heard}${did ? ` → ${did}` : ""}` : `예: ${examples}`;

  if (wantsAlways && mic !== "granted") {
    return (
      <div className="voice-bar">
        <button
          className="btn btn-tonal"
          onClick={async () => {
            const perm = await ensure("mic");
            setMic(perm.ok ? "granted" : "denied");
          }}
        >
          <Icon name="mic" size={20} /> 마이크 허용하고 듣기
        </button>
        <p className="label-medium muted voice-hint">걷는 동안 버튼 없이 말로 조작해요</p>
        {permDialog}
      </div>
    );
  }

  if (wantsAlways) {
    const on = always && state === "on";
    return (
      <div className="voice-bar">
        <span className={`chip label-medium${on ? " voice-live" : ""}`}>
          <Icon name="mic" size={16} /> {state === "denied" ? "마이크를 허용해 주세요" : on ? "듣는 중" : "듣기 꺼짐"}
        </span>
        <button className="btn btn-text label-large" onClick={() => setPaused((p) => !p)}>
          {paused ? "다시 듣기" : "잠깐 끄기"}
        </button>
        <p className="label-medium muted voice-hint" aria-live="polite">
          {result}
        </p>
      </div>
    );
  }

  return (
    <div className="voice-bar">
      <button className={`btn btn-tonal${state === "listening" ? " mic-on" : ""}`} onClick={once} disabled={state === "thinking"} aria-live="polite">
        <Icon name="mic" size={20} /> {state === "listening" ? "듣는 중… 말이 끝나면 멈춰요" : state === "thinking" ? "알아듣는 중…" : label}
      </button>
      <p className="label-medium muted voice-hint" aria-live="polite">
        {result}
      </p>
      {permDialog}
    </div>
  );
}

/** 입력 칸 옆 마이크: 말한 내용을 글자로 넣는다. */
export function DictateButton({ onText, label }: { onText: (text: string) => void; label: string }) {
  const s = useSettings();
  const [on, setOn] = useState<false | "listening" | "thinking">(false);
  const [permDialog, ensure] = usePermission();
  if (!s || !canListen()) return null;
  return (
    <>
      <button
        type="button"
        className={`icon-btn${on === "listening" ? " mic-on" : ""}`}
        aria-label={on === "listening" ? "듣는 중. 다시 누르면 멈춰요" : on === "thinking" ? "알아듣는 중" : label}
        disabled={on === "thinking"}
        onClick={async () => {
          if (on === "listening") return finishListening();
          const perm = await ensure("mic");
          if (!perm.ok) return;
          setOn("listening");
          if (perm.fresh) speak("이제 말해 주세요.", { force: true });
          try {
            const [text] = await listenOnce({
              onPhase: setOn,
              fresh: perm.fresh,
            });
            voiceLog({ heard: text, did: "글자로 넣음" });
            onText(text);
          } catch (e) {
            toast((e as Error).message);
          } finally {
            setOn(false);
          }
        }}
      >
        <Icon name="mic" />
      </button>
      {permDialog}
    </>
  );
}

/** '화면마다 할 일 읽기'를 켜 두면, 화면이 열리거나 바뀔 때 한 줄을 읽어 준다. */
export function useScreenSpeech(text: string | null | undefined) {
  const s = useSettings();
  const said = useRef<string | null>(null);
  useEffect(() => {
    if (!text || !s?.screenSpeech || !s.voice || said.current === text) return;
    said.current = text;
    speak(text);
  }, [text, s?.screenSpeech, s?.voice]);
}
