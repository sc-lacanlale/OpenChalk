import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = { title: 'OpenChalk', description: 'A live whiteboard that talks and draws with you.' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" />
      </head>
      <body className="m-0 h-full">{children}</body>
    </html>
  )
}
