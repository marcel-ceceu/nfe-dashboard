import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'NFes Recebidas - APESP',
  description: 'Dashboard de NFes recebidas',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  )
}
