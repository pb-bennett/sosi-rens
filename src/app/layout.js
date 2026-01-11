/**
 * @file layout.js
 * Root layout for the SOSI-Rens Next.js app.
 * Sets up fonts (Geist Sans/Mono), global CSS, and HTML lang.
 */

import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

/** Geist Sans variable font for body text. */
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

/** Geist Mono variable font for code/mono text. */
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

/** Page metadata (title, description). */
export const metadata = {
  title: 'SOSI-Rens',
  description:
    'Rens SOSI-filer ved å velge objekter og felter du vil beholde.',
};

/**
 * Root layout component.
 * @param {{ children: React.ReactNode }} props
 * @returns {JSX.Element}
 */
export default function RootLayout({ children }) {
  return (
    <html lang="nb">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
