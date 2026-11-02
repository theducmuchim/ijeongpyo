"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { useSettings } from "@/lib/settings";
import { toast } from "@/lib/toast";
import { type Command, canListen, listenAlways, listenOnce, matchCommand, speak } from "@/lib/voice";

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
  const [state, setState] = useState<"idle" | "listening" | "on" | "off" | "denied">("idle");
  const [heard, setHeard] = useState<string | null>(null);
  // 계속 듣는 동안 화면이 바뀌어도 최신 명령 목록으로 맞추게 ref에 둔다
  const latest = useRef({ commands, onCommand, onOther, examples });
  useEffect(() => {
    latest.current = { commands, onCommand, onOther, examples };
  });
  const [paused, setPaused] = useState(false);
  const always = !!allowAlways && s?.listenMode === "always" && !paused;

  function handle(alts: string[], fromAlways: boolean) {
    const { commands: cmds, onCommand: run, onOther: other, examples: ex } = latest.current;
    const text = alts[0] ?? "";
    setHeard(text);
    const c = matchCommand(alts, cmds);
    if (c) return run(c.id, text);
    if (other) return other(text);
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
    setState("listening");
    setHeard(null);
    try {
      handle(await listenOnce((t) => setHeard(t)), false);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setState("idle");
    }
  }

  if (always || (allowAlways && s.listenMode === "always")) {
    const on = always && state === "on";
    return (
      <div className="voice-bar">
        <span className={`chip label-medium${on ? " voice-live" : ""}`}>
          <Icon name="mic" size={16} /> {state === "denied" ? "마이크를 허용해 주세요" : on ? "듣는 중" : "듣기 꺼짐"}
        </span>
        <button className="btn btn-text label-large" onClick={() => setPaused((p) => !p)}>
          {paused ? "다시 듣기" : "잠깐 끄기"}
        </button>
        <p className="label-medium muted voice-hint">{heard ? `들은 말: ${heard}` : `예: ${examples}`}</p>
      </div>
    );
  }

  return (
    <div className="voice-bar">
      <button className={`btn btn-tonal${state === "listening" ? " mic-on" : ""}`} onClick={once} disabled={state === "listening"}>
        <Icon name="mic" size={20} /> {state === "listening" ? "듣는 중…" : label}
      </button>
      <p className="label-medium muted voice-hint" aria-live="polite">
        {heard ? `들은 말: ${heard}` : `예: ${examples}`}
      </p>
    </div>
  );
}

/** 입력 칸 옆 마이크: 말한 내용을 글자로 넣는다. */
export function DictateButton({ onText, label }: { onText: (text: string) => void; label: string }) {
  const s = useSettings();
  const [on, setOn] = useState(false);
  if (!s || !canListen()) return null;
  return (
    <button
      type="button"
      className={`icon-btn${on ? " mic-on" : ""}`}
      aria-label={on ? "듣는 중" : label}
      disabled={on}
      onClick={async () => {
        setOn(true);
        try {
          const [text] = await listenOnce();
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
