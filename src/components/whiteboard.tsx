'use client'

import { useEffect, useRef } from 'react'
import { createBoard } from '@/engine/board'
import { mountSession } from '@/engine/live'

export function Whiteboard() {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    return mountSession(el, createBoard(el))
  }, [])

  return (
    <div
      ref={root}
      className="h-full bg-[#f5f5f7] p-4 font-[Inter,-apple-system,BlinkMacSystemFont,system-ui,sans-serif] text-sm leading-[1.45] tracking-[-0.01em] text-[#1d1d1f] max-[1080px]:p-0 [&_button]:cursor-pointer [&_button]:font-[inherit] [&_input]:font-[inherit] [&_select]:font-[inherit]"
    >
      <div className="relative h-full overflow-hidden rounded-[22px] bg-white shadow-[0_1px_3px_rgba(0,0,0,.06),0_20px_60px_rgba(0,0,0,.06)] max-[1080px]:rounded-none has-[#assist[hidden]]:[&_#board]:w-full has-[#assist[hidden]]:[&_#caption]:w-[calc(100%-48px)] has-[#assist[hidden]]:[&_#controls]:right-4 has-[#assist[hidden]]:[&_#composer]:left-1/2 has-[#assist[hidden]]:[&_#composer]:w-[min(560px,calc(100%-48px))] has-[#assist[hidden]]:[&_#composer]:-translate-x-1/2 max-[1080px]:has-[#assist[hidden]]:[&_#board]:h-[calc(100%-88px)] max-[1080px]:has-[#assist[hidden]]:[&_#composer]:left-2 max-[1080px]:has-[#assist[hidden]]:[&_#composer]:w-auto max-[1080px]:has-[#assist[hidden]]:[&_#composer]:translate-none">
        <svg
          id="board"
          viewBox="0 0 1200 700"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Whiteboard"
          className="absolute top-14 left-0 block h-[calc(100%-196px)] w-[calc(100%-392px)] max-[1080px]:relative max-[1080px]:top-0 max-[1080px]:h-[52vh] max-[1080px]:w-full"
        >
          <defs id="defs" />
          <g id="gInk" />
          <g id="gPen" style={{ opacity: 0 }}>
            <circle r="6" fill="#0071e3" />
            <circle r="15" fill="#0071e3" opacity=".18" />
          </g>
        </svg>
        <div
          id="empty"
          className="[&[hidden]]:!hidden absolute top-[22%] left-0 flex w-[calc(100%-392px)] flex-col items-center gap-4 px-6 text-center max-[1080px]:top-[10%] max-[1080px]:w-full"
        >
          <p className="m-0 font-[Caveat,cursive] text-4xl text-[#667085]">What do you want to learn?</p>
          <div className="flex flex-wrap justify-center gap-2">
            {['How do cells work?', 'Why is the sky blue?', 'Explain photosynthesis', 'How does a bill become law?'].map((t) => (
              <button
                key={t}
                type="button"
                data-say={'Teach me: ' + t}
                data-label={t}
                className="h-9 rounded-full border border-[#d2d2d7] bg-white px-4 text-[14px] text-[#1d1d1f] hover:bg-[#f5f5f7]"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div
          id="caption"
          aria-live="polite"
          className="pointer-events-none absolute bottom-[118px] left-6 line-clamp-2 w-[calc(100%-440px)] text-center text-xl leading-[1.3] empty:hidden max-[1080px]:right-3 max-[1080px]:bottom-24 max-[1080px]:left-3 max-[1080px]:w-auto"
        />
        <div className="absolute top-4 left-4 flex items-center gap-2 max-[1080px]:top-2 max-[1080px]:left-2">
          <div className="flex h-11 items-center gap-2 rounded-[14px] border border-[#e8e8ed] bg-white/85 px-3 backdrop-blur-[20px]">
            <strong className="text-sm">OpenChalk</strong>
            <span
              id="status"
              role="status"
              className="flex items-center gap-1.5 text-xs text-[#6e6e73] before:h-2 before:w-2 before:shrink-0 before:rounded-full before:bg-[#86868b] before:content-['']"
            >
              Not connected
            </span>
          </div>
          <div className="flex h-11 items-center gap-0.5 rounded-[14px] border border-[#e8e8ed] bg-white/85 px-1.5 backdrop-blur-[20px] max-[1080px]:hidden">
            {[
              ['auto', 'Auto', 'Auto keeps the presentation moving when you are quiet. Click to pause it'],
              ['undo', 'Undo', 'Remove the last thing drawn or written'],
              ['newBoard', 'New', 'Clear the board'],
              ['save', 'Save', 'Download the board as an image'],
            ].map(([id, label, tip]) => (
              <button
                key={id}
                id={id}
                type="button"
                title={tip}
                className="h-8 rounded-[10px] px-2.5 text-[13px] font-medium text-[#1d1d1f] hover:bg-[#f5f5f7] focus-visible:outline-2 focus-visible:outline-[#0071e3]"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div id="controls" className="absolute top-4 right-[408px] flex items-center gap-2 max-[1080px]:top-2 max-[1080px]:right-2">
          <select
            id="mode"
            aria-label="Mode"
            className="h-9 rounded-[10px] border border-[#e8e8ed] bg-white px-2.5 text-[#1d1d1f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3]"
          >
            <option value="tutor">Tutor</option>
            <option value="presenter">Presenter</option>
          </select>
          <button
            id="assistToggle"
            type="button"
            aria-expanded="true"
            className="h-9 rounded-[10px] border border-[#e8e8ed] bg-white px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3]"
          >
            Hide
          </button>
          <button
            id="go"
            type="button"
            className="h-9 rounded-[10px] bg-[#0071e3] px-[18px] text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3]"
          >
            Start
          </button>
        </div>
        <aside
          id="assist"
          aria-label="AI chat"
          className="absolute top-[68px] right-4 bottom-4 flex w-[360px] flex-col overflow-hidden rounded-[20px] border border-[#e8e8ed] bg-[#fbfbfd] [&[hidden]]:!hidden max-[1080px]:top-auto max-[1080px]:right-2 max-[1080px]:bottom-[88px] max-[1080px]:left-2 max-[1080px]:h-[34vh] max-[1080px]:w-auto"
        >
          <div className="border-b border-[#e8e8ed] bg-white px-[18px] py-3.5 text-[15px] font-semibold">Chat</div>
          <div id="log" aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto p-[18px]" />
        </aside>
        <div
          id="quick"
          hidden
          className="[&[hidden]]:!hidden absolute bottom-[78px] left-[calc((100%-392px)/2)] flex -translate-x-1/2 gap-2 max-[1080px]:bottom-[70px] max-[1080px]:left-1/2"
        >
          {['Not sure', 'Go on', 'Explain simpler', 'Quiz me'].map((t) => (
            <button
              key={t}
              type="button"
              data-say={
                t === 'Not sure'
                  ? "I'm not sure. Give me a hint."
                  : t === 'Go on'
                    ? 'Go on, continue.'
                    : t === 'Quiz me'
                      ? 'Quiz me on this.'
                      : 'Explain that more simply.'
              }
              data-label={t}
              className="h-8 rounded-full border border-[#d2d2d7] bg-white/95 px-3.5 text-[13px] text-[#1d1d1f] shadow-sm hover:bg-[#f5f5f7]"
            >
              {t}
            </button>
          ))}
        </div>
        <div
          id="composer"
          className="absolute bottom-5 left-[calc((100%-392px)/2)] flex w-[min(560px,calc(100%-440px))] -translate-x-1/2 items-center gap-1.5 rounded-[18px] bg-[#1c1c1e] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,.25)] max-[1080px]:right-2 max-[1080px]:bottom-3 max-[1080px]:left-2 max-[1080px]:w-auto max-[1080px]:translate-none"
        >
          <button
            id="mute"
            type="button"
            aria-pressed="false"
            aria-label="Mute microphone"
            className="h-11 w-11 shrink-0 rounded-xl bg-[#2c2c2e] text-[13px] font-semibold text-[#f5f5f7] aria-pressed:text-[#ff6961]"
          >
            Mic
          </button>
          <span id="muteLabel" className="shrink-0 px-1 text-xs font-semibold text-[#ff6961] empty:hidden" />
          <input
            id="txt"
            type="text"
            placeholder="Ask the board to draw or explain"
            aria-label="Message"
            className="h-11 min-w-0 flex-1 border-0 bg-transparent text-[15px] text-[#f5f5f7] outline-none placeholder:text-[#a1a1a6]"
          />
          <button id="send" type="button" aria-label="Send" className="h-11 w-11 shrink-0 rounded-xl bg-[#0071e3] text-base font-semibold text-white">
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}
