'use client'

import { useState, useRef, useEffect } from 'react'
import useSWR from 'swr'
import Markdown from 'react-markdown'
import {
  Sparkles,
  X,
  Send,
  RotateCcw,
  Video,
  Settings2,
  AlertTriangle,
  Copy,
  Check,
  Loader2,
  FileVideo,
  KeyRound,
  Cpu,
  ChevronDown,
  Info,
  RefreshCw,
} from 'lucide-react'
import { fetcher } from '@/lib/format'

interface KeySlotInfo {
  slot: number
  label: string
}

interface KeysResponse {
  slots: KeySlotInfo[]
  hasEnvKey: boolean
  hasAnyKey: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'model'
  content: string
  timestamp: number
  videoInfo?: {
    name: string
    sizeStr: string
    fps: number
    timelapse: number
  }
  isError?: boolean
  errorDetail?: string
  modelUsed?: string
}

const AVAILABLE_MODELS = [
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', tag: '3.7-shiva · Fast Forensic' },
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', tag: '3.8-shiva · Deep Forensic (Recommended)' },
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', tag: '3.6-shiva · Robust Baseline' },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', tag: '3.5-shiva · High Quota' },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', tag: '3.5-shiva-lite · 500 RPD' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', tag: 'Deep Reasoning' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', tag: '3.1-shiva-lite · High Speed' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tag: 'Multimodal' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', tag: 'Deep Multimodal' },
]

const FPS_PRESETS = [24, 1, 2, 5, 0.5]
const TIMELAPSE_PRESETS = [1, 2, 5, 10, 20, 30]

interface GeminiChatDialogProps {
  open: boolean
  onClose: () => void
}

export function GeminiChatDialog({ open, onClose }: GeminiChatDialogProps) {
  const { data: keysData, mutate: refreshKeys } = useSWR<KeysResponse>('/api/chat/keys', fetcher)

  // Config State
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash')
  const [keySelection, setKeySelection] = useState<string>('auto') // 'auto' | 'custom' | slot string e.g. "1"
  const [customKey, setCustomKey] = useState<string>('')
  const [showCustomKeyInput, setShowCustomKeyInput] = useState<boolean>(false)

  // Messages State
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputPrompt, setInputPrompt] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [elapsedSec, setElapsedSec] = useState<number>(0)

  // Video State
  const [attachedVideo, setAttachedVideo] = useState<File | null>(null)
  const [fps, setFps] = useState<number>(24)
  const [timelapse, setTimelapse] = useState<number>(1)
  const [showVideoSettings, setShowVideoSettings] = useState<boolean>(true)

  // UI state
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [syncingKeys, setSyncingKeys] = useState<boolean>(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const lastSentRequestRef = useRef<{
    prompt: string
    video: File | null
    fps: number
    timelapse: number
  } | null>(null)

  async function handleSyncKeys() {
    setSyncingKeys(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/chat/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resync' }),
      })
      if (res.ok) {
        await refreshKeys()
        setSyncMsg('Keys copied from Settings into Chat pool!')
        setTimeout(() => setSyncMsg(null), 3500)
      }
    } catch {
      // ignore
    } finally {
      setSyncingKeys(false)
    }
  }

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-scroll when messages change or loading
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Timer while loading
  useEffect(() => {
    if (loading) {
      setElapsedSec(0)
      timerRef.current = setInterval(() => {
        setElapsedSec((prev) => prev + 1)
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [loading])

  // Refresh available keys when opened
  useEffect(() => {
    if (open) {
      void refreshKeys()
    }
  }, [open, refreshKeys])

  if (!open) return null

  function formatFileSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setAttachedVideo(file)
      setShowVideoSettings(true)
    }
  }

  function removeAttachedVideo() {
    setAttachedVideo(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleNewChat() {
    if (loading) return
    setMessages([])
    setInputPrompt('')
    removeAttachedVideo()
  }

  async function handleCopy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // ignore
    }
  }

  async function handleSend(retryPrompt?: string, retryVideo?: File | null) {
    const promptToSend = retryPrompt !== undefined ? retryPrompt : inputPrompt.trim()
    const videoToSend = retryVideo !== undefined ? retryVideo : attachedVideo

    if (!promptToSend && !videoToSend) return
    if (loading) return

    const userMessageId = `user-${Date.now()}`
    const newUserMsg: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: promptToSend || (videoToSend ? 'Analyze this video clip.' : ''),
      timestamp: Date.now(),
      videoInfo: videoToSend
        ? {
            name: videoToSend.name,
            sizeStr: formatFileSize(videoToSend.size),
            fps,
            timelapse,
          }
        : undefined,
    }

    lastSentRequestRef.current = {
      prompt: promptToSend,
      video: videoToSend,
      fps,
      timelapse,
    }

    setMessages((prev) => [...prev, newUserMsg])
    setInputPrompt('')
    setAttachedVideo(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setLoading(true)

    // Build history for backend
    const historyPayload = messages
      .filter((m) => !m.isError)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }))

    try {
      let res: Response
      if (videoToSend) {
        const formData = new FormData()
        formData.append('prompt', promptToSend)
        formData.append('model', selectedModel)
        formData.append('keySelection', keySelection === 'custom' ? 'custom' : keySelection === 'auto' ? 'auto' : 'slot')
        if (keySelection !== 'auto' && keySelection !== 'custom') {
          formData.append('keySlot', keySelection)
        }
        if (keySelection === 'custom') {
          formData.append('customKey', customKey.trim())
        }
        formData.append('fps', String(fps))
        formData.append('timelapse', String(timelapse))
        formData.append('history', JSON.stringify(historyPayload))
        formData.append('video', videoToSend)

        res = await fetch('/api/chat', {
          method: 'POST',
          body: formData,
        })
      } else {
        res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptToSend,
            model: selectedModel,
            keySelection: keySelection === 'custom' ? 'custom' : keySelection === 'auto' ? 'auto' : 'slot',
            keySlot: keySelection !== 'auto' && keySelection !== 'custom' ? Number(keySelection) : null,
            customKey: keySelection === 'custom' ? customKey.trim() : '',
            fps,
            timelapse,
            history: historyPayload,
          }),
        })
      }

      const data = await res.json()

      if (!res.ok || data.error) {
        const errorMsg = data.error || 'Gemini request failed'
        const botErrorMsg: ChatMessage = {
          id: `bot-err-${Date.now()}`,
          role: 'model',
          content: '',
          timestamp: Date.now(),
          isError: true,
          errorDetail: errorMsg,
          modelUsed: selectedModel,
        }
        setMessages((prev) => [...prev, botErrorMsg])
      } else {
        const botMsg: ChatMessage = {
          id: `bot-${Date.now()}`,
          role: 'model',
          content: data.reply || 'No text output returned.',
          timestamp: Date.now(),
          modelUsed: data.model || selectedModel,
        }
        setMessages((prev) => [...prev, botMsg])
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      const botErrorMsg: ChatMessage = {
        id: `bot-err-${Date.now()}`,
        role: 'model',
        content: '',
        timestamp: Date.now(),
        isError: true,
        errorDetail: errorMsg,
        modelUsed: selectedModel,
      }
      setMessages((prev) => [...prev, botErrorMsg])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Gemini AI Studio Chat"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-4 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="flex h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        {/* TOP HEADER */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-300 text-zinc-950 shadow-md shadow-amber-500/20">
              <Sparkles className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-zinc-100 sm:text-base">
                  Gemini <span className="text-amber-400">AI Studio Chat</span>
                </h2>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                  Separate Keys · 0 Quota Counted
                </span>
              </div>
              <p className="hidden text-[11px] text-zinc-400 sm:block">
                Keys auto-copied from Settings without double-entry · zero usage/exhaustion recorded
              </p>
            </div>
          </div>

          {/* Model and Key Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Model Selector */}
            <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 shadow-sm">
              <Cpu className="size-3.5 text-zinc-400" />
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={loading}
                aria-label="Choose Gemini Model"
                className="bg-transparent text-xs font-medium text-zinc-200 focus:outline-none cursor-pointer"
              >
                {AVAILABLE_MODELS.map((m) => (
                  <option key={m.id} value={m.id} className="bg-zinc-900 text-zinc-200">
                    {m.name} ({m.tag})
                  </option>
                ))}
              </select>
            </div>

            {/* API Key Selector */}
            <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 shadow-sm">
              <KeyRound className="size-3.5 text-amber-400" />
              <select
                value={keySelection}
                onChange={(e) => {
                  setKeySelection(e.target.value)
                  setShowCustomKeyInput(e.target.value === 'custom')
                }}
                disabled={loading}
                aria-label="Choose API Key"
                className="bg-transparent text-xs font-medium text-zinc-200 focus:outline-none cursor-pointer"
              >
                <option value="auto" className="bg-zinc-900 text-zinc-200">
                  Auto (Primary Chat Key)
                </option>
                {(keysData?.slots || []).map((s) => (
                  <option key={s.slot} value={String(s.slot)} className="bg-zinc-900 text-zinc-200">
                    {s.label}
                  </option>
                ))}
                <option value="custom" className="bg-zinc-900 text-amber-300">
                  Custom Key (Paste manually)
                </option>
              </select>
            </div>

            {/* Sync from Settings Button */}
            <button
              type="button"
              onClick={handleSyncKeys}
              disabled={syncingKeys || loading}
              title="Copy / Sync all keys from Settings to this Chat section without re-typing"
              className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-amber-500/40 hover:bg-zinc-800 hover:text-amber-300 transition-colors"
            >
              <RefreshCw className={`size-3 text-amber-400 ${syncingKeys ? 'animate-spin' : ''}`} />
              <span className="hidden lg:inline">Sync from Settings</span>
            </button>

            {/* New Chat Button */}
            <button
              type="button"
              onClick={handleNewChat}
              disabled={loading || messages.length === 0}
              title="Start a new chat session"
              className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-amber-500/40 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40 transition-colors"
            >
              <RotateCcw className="size-3.5" />
              <span className="hidden sm:inline">New Chat</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Chat"
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {syncMsg && (
          <div className="flex items-center gap-2 border-b border-emerald-900/40 bg-emerald-950/30 px-4 py-2 text-xs text-emerald-200 animate-in fade-in">
            <Check className="size-4 text-emerald-400 shrink-0" />
            <span>{syncMsg}</span>
          </div>
        )}

        {/* CUSTOM KEY INPUT BAR (if user selected custom key) */}
        {showCustomKeyInput && (
          <div className="flex items-center gap-2 border-b border-amber-900/40 bg-amber-950/20 px-4 py-2 text-xs text-amber-200">
            <KeyRound className="size-4 shrink-0 text-amber-400" />
            <span className="font-semibold shrink-0">Custom Gemini Key:</span>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value)}
              className="flex-1 rounded border border-amber-800/60 bg-zinc-900 px-2.5 py-1 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
            />
            <span className="text-[11px] text-zinc-400 hidden md:inline">
              Used strictly for this chat session
            </span>
          </div>
        )}

        {/* CHAT MESSAGES CONTAINER */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {messages.length === 0 && (
            <div className="my-auto flex flex-col items-center justify-center text-center py-10 px-4">
              <div className="size-14 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-orange-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-xl mb-4">
                <Sparkles className="size-7" />
              </div>
              <h3 className="text-xl font-semibold text-zinc-100 mb-2">
                What would you like to ask or analyze?
              </h3>
              <p className="max-w-md text-xs sm:text-sm text-zinc-400 mb-6 leading-relaxed">
                Chat manually with Gemini or upload a video clip. You can adjust the <strong>FPS</strong> and <strong>timelapse speed</strong> before sending.
              </p>

              {/* Starter Prompt Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl text-left">
                {[
                  {
                    title: '🎬 Video Scene Breakdown',
                    prompt: 'Please provide a detailed chronological breakdown of scenes and actions in this clip.',
                  },
                  {
                    title: '⏱️ Timestamp Match Check',
                    prompt: 'Identify the exact timestamps (MM:SS) of all key visual movements or camera transitions.',
                  },
                  {
                    title: '🔍 Media Forensics Analysis',
                    prompt: 'Describe the objects, visible text, characters, and background lighting in detail.',
                  },
                  {
                    title: '⚙️ Explain Timelapse & FPS',
                    prompt: 'How does lowering video FPS and applying timelapse speed affect Gemini multimodal analysis and tokens?',
                  },
                ].map((card, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setInputPrompt(card.prompt)}
                    className="group rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3 hover:border-amber-500/50 hover:bg-zinc-900 transition-all text-left shadow-sm"
                  >
                    <p className="text-xs font-semibold text-zinc-200 group-hover:text-amber-300">
                      {card.title}
                    </p>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 mt-1">
                      {card.prompt}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Render Messages */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              {/* User Bubble */}
              {msg.role === 'user' && (
                <div className="max-w-2xl rounded-2xl rounded-tr-sm bg-amber-500/15 border border-amber-500/30 p-3.5 text-zinc-100 shadow-md">
                  {/* Attached Video Badge if present */}
                  {msg.videoInfo && (
                    <div className="mb-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-zinc-950/70 p-2 text-xs">
                      <FileVideo className="size-4 text-amber-400 shrink-0" />
                      <span className="font-semibold text-zinc-200 truncate max-w-[200px]">
                        {msg.videoInfo.name}
                      </span>
                      <span className="text-[11px] text-zinc-400">({msg.videoInfo.sizeStr})</span>
                      <div className="ml-auto flex items-center gap-1.5">
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-mono text-amber-300 font-semibold">
                          {msg.videoInfo.fps} FPS
                        </span>
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300">
                          {msg.videoInfo.timelapse}x Timelapse
                        </span>
                      </div>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                </div>
              )}

              {/* Model Bubble or Error Bubble */}
              {msg.role === 'model' && (
                <div className="w-full max-w-3xl">
                  {msg.isError ? (
                    /* Error Card directly in chat stream */
                    <div className="rounded-2xl rounded-tl-sm border border-red-500/40 bg-red-950/30 p-4 text-zinc-100 shadow-lg">
                      <div className="flex items-center gap-2 text-red-400 mb-2">
                        <AlertTriangle className="size-4 shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-wider">
                          Gemini Request Error
                        </span>
                        {msg.modelUsed && (
                          <span className="rounded bg-red-950 border border-red-800/50 px-2 py-0.5 text-[10px] font-mono text-red-300">
                            {msg.modelUsed}
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-red-200 font-mono bg-black/40 p-2.5 rounded-lg border border-red-900/50 whitespace-pre-wrap mb-3">
                        {msg.errorDetail}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            const last = lastSentRequestRef.current
                            if (last) {
                              void handleSend(last.prompt, last.video)
                            } else {
                              void handleSend(messages[messages.length - 2]?.content)
                            }
                          }}
                          className="flex items-center gap-1 rounded-md bg-red-600 px-3 py-1 font-semibold text-white hover:bg-red-500 transition-colors shadow"
                        >
                          <RotateCcw className="size-3" /> Retry Request
                        </button>
                        <button
                          type="button"
                          onClick={handleNewChat}
                          className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1 font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
                        >
                          New Chat
                        </button>
                        <span className="text-[11px] text-zinc-400 ml-auto">
                          Tip: Check API keys in Settings or select another model above.
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* Normal Gemini Output Bubble */
                    <div className="rounded-2xl rounded-tl-sm border border-zinc-800 bg-zinc-900/70 p-4 text-zinc-100 shadow-md">
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="flex size-5 items-center justify-center rounded-md bg-amber-500/20 text-amber-400">
                            <Sparkles className="size-3" />
                          </span>
                          <span className="text-xs font-semibold text-zinc-300">Gemini</span>
                          {msg.modelUsed && (
                            <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-mono text-zinc-400">
                              {msg.modelUsed}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                          title="Copy to clipboard"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="size-3 text-emerald-400" />
                              <span className="text-[10px] text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="size-3" />
                              <span className="text-[10px]">Copy</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Markdown rendered body */}
                      <div className="prose prose-invert max-w-none text-xs sm:text-sm text-zinc-200 leading-relaxed space-y-2 [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:list-decimal [&>ol]:pl-5 [&>pre]:bg-zinc-950 [&>pre]:border [&>pre]:border-zinc-800 [&>pre]:p-3 [&>pre]:rounded-lg [&>code]:bg-zinc-800 [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:rounded [&>code]:text-amber-300">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* LOADING INDICATOR */}
          {loading && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-zinc-200 shadow-md animate-pulse">
              <Loader2 className="size-5 animate-spin text-amber-400 shrink-0" />
              <div>
                <p className="text-xs sm:text-sm font-semibold text-amber-300">
                  {attachedVideo || messages[messages.length - 1]?.videoInfo
                    ? `Uploading video & analyzing with ${selectedModel} (${fps} FPS)... (${elapsedSec}s)`
                    : `Gemini is generating response... (${elapsedSec}s)`}
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Direct upload with native Gemini videoMetadata ({fps} FPS) — zero CPU re-encode lag.
                </p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ATTACHED VIDEO & VIDEO SETTINGS BAR (Above Input) */}
        {attachedVideo && (
          <div className="border-t border-zinc-800 bg-zinc-900/95 p-3 px-4 shadow-inner">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <FileVideo className="size-4 text-amber-400" />
                <span className="text-xs font-semibold text-zinc-200 truncate max-w-[220px]">
                  {attachedVideo.name}
                </span>
                <span className="text-[11px] text-zinc-400">
                  ({formatFileSize(attachedVideo.size)})
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowVideoSettings(!showVideoSettings)}
                  className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
                >
                  <Settings2 className="size-3.5" />
                  <span>Video Settings</span>
                  <ChevronDown
                    className={`size-3 transition-transform ${showVideoSettings ? 'rotate-180' : ''}`}
                  />
                </button>
                <button
                  type="button"
                  onClick={removeAttachedVideo}
                  aria-label="Remove video"
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-red-400 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Video Processing Controls: FPS and Timelapse */}
            {showVideoSettings && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* FPS Control */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-semibold text-zinc-300">
                        Frame Rate (FPS)
                      </label>
                      <span className="text-[11px] font-mono font-bold text-amber-400">
                        {fps} fps
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {FPS_PRESETS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setFps(p)}
                          className={`rounded px-2 py-1 text-[11px] font-mono transition-colors ${
                            fps === p
                              ? 'bg-amber-500 font-bold text-zinc-950 shadow'
                              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          }`}
                        >
                          {p} fps
                        </button>
                      ))}
                      <input
                        type="number"
                        min="0.1"
                        max="60"
                        step="0.5"
                        value={fps}
                        onChange={(e) => setFps(Number(e.target.value) || 1)}
                        className="w-16 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-center font-mono text-[11px] text-zinc-100 focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Timelapse / Speed Control */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-semibold text-zinc-300">
                        Timelapse Speed Factor
                      </label>
                      <span className="text-[11px] font-mono font-bold text-amber-400">
                        {timelapse}x speed
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {TIMELAPSE_PRESETS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTimelapse(t)}
                          className={`rounded px-2 py-1 text-[11px] font-mono transition-colors ${
                            timelapse === t
                              ? 'bg-amber-500 font-bold text-zinc-950 shadow'
                              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          }`}
                        >
                          {t === 1 ? '1x (Normal)' : `${t}x`}
                        </button>
                      ))}
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={timelapse}
                        onChange={(e) => setTimelapse(Math.max(1, Number(e.target.value) || 1))}
                        className="w-16 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-center font-mono text-[11px] text-zinc-100 focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 border-t border-zinc-800/80 pt-2">
                  <Info className="size-3 text-amber-400 shrink-0" />
                  <span>
                    Request configuration: <strong>{fps} FPS</strong> ·{' '}
                    <strong>{timelapse}x Timelapse</strong> (Direct video upload with native Gemini <strong>videoMetadata: &#123; fps: {fps} &#125;</strong> sampling — no CPU re-encode).
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* BOTTOM INPUT BAR */}
        <div className="border-t border-zinc-800 bg-zinc-900/90 p-3 sm:p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleSend()
            }}
            className="flex items-end gap-2"
          >
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/mkv,video/*"
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Video Attachment Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              title="Upload video clip for AI analysis"
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl border transition-all ${
                attachedVideo
                  ? 'border-amber-500 bg-amber-500/20 text-amber-300 shadow-sm'
                  : 'border-zinc-800 bg-zinc-800/70 text-zinc-400 hover:border-amber-500/40 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <Video className="size-4" />
            </button>

            {/* Textarea Input */}
            <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 focus-within:border-amber-500/70 focus-within:ring-1 focus-within:ring-amber-500/40 transition-all shadow-inner">
              <textarea
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleSend()
                  }
                }}
                disabled={loading}
                placeholder={
                  attachedVideo
                    ? `Describe what you want Gemini to analyze in "${attachedVideo.name}"... (Press Enter)`
                    : 'Message Gemini... Ask questions, analyze forensics, or upload a video clip (Press Enter)'
                }
                rows={1}
                className="w-full resize-none bg-transparent text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none max-h-32"
              />
            </div>

            {/* Send Button */}
            <button
              type="submit"
              disabled={loading || (!inputPrompt.trim() && !attachedVideo)}
              title="Send to Gemini"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-zinc-950 font-bold shadow-md shadow-amber-500/25 hover:bg-amber-400 hover:shadow-lg disabled:opacity-40 disabled:shadow-none transition-all"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </button>
          </form>

          <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-zinc-500">
            <span>Press Shift+Enter for new line · Enter to send</span>
            <span>Completely isolated · Does not alter matchtool scans</span>
          </div>
        </div>
      </div>
    </div>
  )
}
