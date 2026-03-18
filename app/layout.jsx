import { Geist, Geist_Mono } from 'next/font/google'
import '@styles/_globals.scss'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin']
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin']
})

export const metadata = {
  title: 'Bodega App',
  description: 'Sistema de gestión de inventario y bodega'
}

export default function RootLayout({ children }) {
  return (
    <html lang='es' className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <div className='app-shell' id='root'>
          {children}
        </div>
      </body>
    </html>
  )
}