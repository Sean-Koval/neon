'use client'

import { clsx } from 'clsx'
import { memo } from 'react'
import { highlightVariables } from '@/lib/extract-variables'

interface ChatMessage {
  role: string
  content: string
}

interface ChatMessagesProps {
  messages: ChatMessage[]
}

const roleStyles: Record<string, { label: string; color: string }> = {
  system: { label: 'SYSTEM', color: 'text-purple-500' },
  user: { label: 'USER', color: 'text-blue-500' },
  assistant: { label: 'ASSISTANT', color: 'text-emerald-500' },
}

function HighlightedContent({ content }: { content: string }) {
  const segments = highlightVariables(content)
  return (
    <span>
      {segments.map((seg, i) =>
        seg.isVariable ? (
          <span
            key={i}
            className="text-amber-500 font-semibold"
          >
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  )
}

function ChatMessagesComponent({ messages }: ChatMessagesProps) {
  if (!messages || messages.length === 0) {
    return (
      <p className="text-sm text-content-muted italic">No messages</p>
    )
  }

  return (
    <div className="space-y-3">
      {messages.map((msg, i) => {
        const style = roleStyles[msg.role] ?? { label: msg.role.toUpperCase(), color: 'text-content-muted' }
        return (
          <div
            key={i}
            className="bg-surface-card border border-border rounded-md p-3"
          >
            <div className={clsx('text-xs font-semibold uppercase tracking-wider mb-1.5', style.color)}>
              {style.label}
            </div>
            <div className="font-mono text-sm whitespace-pre-wrap text-content-primary">
              <HighlightedContent content={msg.content} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export const ChatMessages = memo(ChatMessagesComponent)
