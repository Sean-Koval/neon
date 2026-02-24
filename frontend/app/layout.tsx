import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { CommandPalette } from '@/components/command-palette'
import { GlobalShortcuts } from '@/components/global-shortcuts'
import { KeyboardShortcutsOverlay } from '@/components/keyboard-shortcuts'
import { Sidebar, MobileMenuButton } from '@/components/sidebar'
import { SidebarProvider } from '@/components/sidebar-context'
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
          <SidebarProvider>
            <div className="flex h-screen bg-surface-base">
              <Sidebar />
              <main className="flex-1 overflow-auto bg-surface-raised">
                <MobileMenuButton />
                {children}
              </main>
            </div>
          </SidebarProvider>
          <CommandPalette />
          <KeyboardShortcutsOverlay />
          <GlobalShortcuts />
          <StatusBar />
        </Providers>
      </body>
    </html>
  )
}
