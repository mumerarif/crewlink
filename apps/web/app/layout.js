import './globals.css';

export const metadata = {
  title: 'CrewLink — Member Callout',
  description: 'Member callout coordination for crews',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
