import './globals.css';

export const metadata = { title: 'Aria - Aura Skincare voice support', description: 'Talk to Aria, Aura Skincare\'s AI voice support agent.' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
