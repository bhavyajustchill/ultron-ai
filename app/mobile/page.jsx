"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Send,
  Volume1,
  Volume2,
  VolumeX,
  Minimize2,
  Lock,
  SunMedium,
  Activity,
  Radio,
  Cpu,
  RefreshCw,
  Terminal,
} from "lucide-react";

export default function MobileRemotePage() {
  const [token, setToken] = useState("");
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [desktopState, setDesktopState] = useState({
    status: "CONNECTED",
    latencyMs: 38,
    systemTelemetry: { cpu: 18, mem: 46, gpu: 12, uptime: "12:40" },
    recentComms: [],
  });
  const [syncStatus, setSyncStatus] = useState("SYNCED");
  const [feedbackMsg, setFeedbackMsg] = useState("");

  // Extract token from query params on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get("token") || "relay_mobile_guest";
      setToken(urlToken);
    }
  }, []);

  // Poll desktop state from /api/relay every 1.8 seconds
  useEffect(() => {
    let isMounted = true;

    const pollDesktop = async () => {
      try {
        const res = await fetch("/api/relay?client=mobile");
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data.desktopState) {
            setDesktopState((prev) => ({
              ...prev,
              ...data.desktopState,
            }));
            setSyncStatus("SYNCED");
          }
        }
      } catch (err) {
        if (isMounted) setSyncStatus("DISCONNECTED");
      }
    };

    pollDesktop();
    const interval = setInterval(pollDesktop, 1800);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const sendDirective = async (type, payload) => {
    try {
      setSyncStatus("DISPATCHING");
      const res = await fetch("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "mobile",
          token,
          type,
          payload,
        }),
      });

      if (res.ok) {
        setSyncStatus("SYNCED");
        setFeedbackMsg(`Directive sent: ${payload}`);
        setTimeout(() => setFeedbackMsg(""), 2500);
      }
    } catch (err) {
      setSyncStatus("ERROR");
      console.error("Relay error:", err);
    }
  };

  const handleSendText = (e) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    sendDirective("text_directive", inputText.trim());
    setInputText("");
  };

  // Push-to-Talk speech recognition relay
  const recognitionRef = useRef(null);

  const startVoiceCapture = () => {
    if (typeof window === "undefined") return;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        const recognition = new SpeechRec();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-US";

        recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          if (transcript) {
            sendDirective("text_directive", transcript);
          }
        };

        recognition.onerror = () => {
          setIsRecording(false);
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsRecording(true);
      } catch (err) {
        console.warn("Speech recognition not permitted:", err);
        setIsRecording(false);
      }
    } else {
      // Fallback: prompt for vocal directive
      const promptText = prompt("Enter vocal directive for J.A.R.V.I.S:");
      if (promptText) {
        sendDirective("text_directive", promptText);
      }
    }
  };

  const stopVoiceCapture = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) { }
    }
    setIsRecording(false);
  };

  return (
    <main className="min-h-screen bg-[#0A0B10] text-[#F0F2F8] flex flex-col justify-between p-4 font-mono select-none">
      {/* Top Header */}
      <header className="flex items-center justify-between border-b border-[rgba(0,240,255,0.25)] pb-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-base font-['Orbitron',sans-serif] font-black tracking-widest text-[#00F0FF]">
              J.A.R.V.I.S
            </span>
            <span className="text-[10px] px-1.5 py-0.2 chamfer-xs bg-[#00F0FF]/15 text-[#00F0FF] font-bold">
              MOBILE RELAY
            </span>
          </div>
          <span className="text-[9px] text-[#7E859E]">Mark II Companion Link</span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 px-2 py-1 chamfer-xs bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.1)]">
            <span
              className={`w-2 h-2 rounded-full ${syncStatus === "SYNCED"
                  ? "bg-[#00FF66] animate-pulse"
                  : syncStatus === "DISPATCHING"
                    ? "bg-[#00F0FF] animate-spin"
                    : "bg-[#FF003C]"
                }`}
            />
            <span className="text-[10px] text-[#7E859E]">{syncStatus}</span>
          </div>
        </div>
      </header>

      {/* Host Telemetry Bar */}
      <section className="my-3 p-2.5 chamfer-md border border-[rgba(0,240,255,0.2)] bg-[rgba(10,11,16,0.9)] flex items-center justify-between text-xs">
        <div className="flex flex-col">
          <span className="text-[9px] text-[#7E859E]">STATUS</span>
          <span className="text-[#00F0FF] font-bold">{desktopState.status}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-[#7E859E]">CPU</span>
          <span className="text-[#00FF66] font-bold">{desktopState.systemTelemetry.cpu}%</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-[#7E859E]">MEM</span>
          <span className="text-[#E5A910] font-bold">{desktopState.systemTelemetry.mem}%</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-[#7E859E]">HOST UP</span>
          <span className="text-[#F0F2F8] font-bold">{desktopState.systemTelemetry.uptime}</span>
        </div>
      </section>

      {/* Central Push-to-Talk Mic Zone */}
      <section className="my-auto flex flex-col items-center justify-center gap-4 py-6">
        <div className="relative flex items-center justify-center">
          {/* Animated pulse rings */}
          <div
            className={`absolute w-44 h-44 rounded-full border border-[#FF003C]/30 transition-all duration-500 ${isRecording ? "scale-125 animate-ping opacity-60" : "scale-100 opacity-20"
              }`}
          />
          <div
            className={`absolute w-36 h-36 rounded-full border border-[#00F0FF]/40 transition-all duration-300 ${isRecording ? "scale-110 opacity-70" : "scale-100 opacity-30"
              }`}
          />

          <button
            onPointerDown={startVoiceCapture}
            onPointerUp={stopVoiceCapture}
            className={`relative w-28 h-28 rounded-full border-2 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all shadow-lg active:scale-95 ${isRecording
                ? "border-[#FF003C] bg-[#FF003C]/20 shadow-[0_0_35px_rgba(255,0,60,0.6)] text-[#FF003C]"
                : "border-[#00F0FF] bg-[rgba(0,240,255,0.08)] hover:bg-[rgba(0,240,255,0.18)] shadow-[0_0_25px_rgba(0,240,255,0.3)] text-[#00F0FF]"
              }`}>
            {isRecording ? (
              <Mic className="w-10 h-10 animate-pulse" />
            ) : (
              <Mic className="w-9 h-9" />
            )}
            <span className="text-[9px] font-['Orbitron',sans-serif] font-bold tracking-wider">
              {isRecording ? "TRANSMITTING" : "HOLD TO TALK"}
            </span>
          </button>
        </div>

        <p className="text-[11px] text-[#7E859E] text-center max-w-xs">
          {isRecording
            ? "Relaying live speech to J.A.R.V.I.S.."
            : "Press and hold to stream vocal directive"}
        </p>

        {feedbackMsg && (
          <div className="px-3 py-1 chamfer-xs bg-[#00FF66]/15 border border-[#00FF66]/40 text-[#00FF66] text-xs animate-in fade-in">
            {feedbackMsg}
          </div>
        )}
      </section>

      {/* Quick Remote OS Controls Rail */}
      <section className="mb-3 grid grid-cols-5 gap-1.5">
        <button
          onClick={() => sendDirective("os_action", "volume_up")}
          className="p-2 chamfer-btn border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] hover:border-[#00F0FF] text-[#F0F2F8] hover:text-[#00F0FF] flex flex-col items-center justify-center gap-1 text-[9px] cursor-pointer">
          <Volume2 className="w-4 h-4" />
          <span>VOL +</span>
        </button>

        <button
          onClick={() => sendDirective("os_action", "volume_down")}
          className="p-2 chamfer-btn border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] hover:border-[#00F0FF] text-[#F0F2F8] hover:text-[#00F0FF] flex flex-col items-center justify-center gap-1 text-[9px] cursor-pointer">
          <Volume1 className="w-4 h-4" />
          <span>VOL -</span>
        </button>

        <button
          onClick={() => sendDirective("os_action", "mute")}
          className="p-2 chamfer-btn border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] hover:border-[#FF003C] text-[#F0F2F8] hover:text-[#FF003C] flex flex-col items-center justify-center gap-1 text-[9px] cursor-pointer">
          <VolumeX className="w-4 h-4" />
          <span>MUTE</span>
        </button>

        <button
          onClick={() => sendDirective("briefing", "morning_briefing")}
          className="p-2 chamfer-btn border border-[rgba(255,0,60,0.3)] bg-[rgba(255,0,60,0.08)] hover:bg-[#FF003C]/20 text-[#FF8095] flex flex-col items-center justify-center gap-1 text-[9px] cursor-pointer">
          <SunMedium className="w-4 h-4 text-[#FF003C]" />
          <span>BRIEFING</span>
        </button>

        <button
          onClick={() => sendDirective("os_action", "minimize_all")}
          className="p-2 chamfer-btn border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] hover:border-[#00F0FF] text-[#F0F2F8] hover:text-[#00F0FF] flex flex-col items-center justify-center gap-1 text-[9px] cursor-pointer">
          <Minimize2 className="w-4 h-4" />
          <span>DESKTOP</span>
        </button>
      </section>

      {/* Live Comms Feed & Input Bar */}
      <footer className="flex flex-col gap-2">
        {/* Recent Comms Mini Feed */}
        {desktopState.recentComms && desktopState.recentComms.length > 0 && (
          <div className="p-2.5 chamfer-md border border-[rgba(255,255,255,0.08)] bg-[rgba(5,5,8,0.85)] max-h-24 overflow-y-auto text-[10px] flex flex-col gap-1">
            {desktopState.recentComms.slice(-3).map((item, idx) => (
              <div key={idx} className="flex items-start gap-1">
                <span
                  className={`font-bold ${item.sender === "jarvis" || item.sender === "ada"
                      ? "text-[#00F0FF]"
                      : item.sender === "user"
                        ? "text-[#FF8095]"
                        : "text-[#7E859E]"
                    }`}>
                  {item.sender ? (item.sender === "ada" ? "JARVIS" : item.sender.toUpperCase()) : "COMMS"}:
                </span>
                <span className="text-[#D0D4E4] truncate">{item.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Text Directive Input */}
        <form onSubmit={handleSendText} className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type tactical directive..."
            className="flex-1 px-3 py-2 chamfer-xs bg-[rgba(255,255,255,0.04)] border border-[rgba(0,240,255,0.3)] text-xs text-[#F0F2F8] placeholder-[#7E859E] focus:outline-none focus:border-[#00F0FF]"
          />
          <button
            type="submit"
            className="px-3 py-2 chamfer-btn bg-[rgba(0,240,255,0.15)] border border-[#00F0FF] text-[#00F0FF] hover:bg-[#00F0FF] hover:text-black transition-all cursor-pointer">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </footer>
    </main>
  );
}

