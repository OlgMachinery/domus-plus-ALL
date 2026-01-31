import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Domus+ | Finanzas Familiares',
  description: 'Gestión de finanzas familiares con IA para recibos',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
