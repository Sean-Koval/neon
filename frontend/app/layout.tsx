import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { CommandPalette } from '@/components/command-palette'
import { GlobalShortcuts } from '@/components/global-shortcuts'
import { KeyboardShortcutsOverlay } from '@/components/keyboard-shortcuts'
import { Sidebar } from '@/components/sidebar'
import { StatusBar } from '@/components/status-bar'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Neon',
  description: 'Agent evaluation platform with durable execution',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <div className="flex h-screen bg-surface-base">
            <Sidebar />
            <main className="flex-1 overflow-auto bg-surface-raised">
              {children}
            </main>
          </div>
          <CommandPalette />
          <KeyboardShortcutsOverlay />
          <GlobalShortcuts />
          <StatusBar />
        </Providers>
      </body>
    </html>
  )
}
