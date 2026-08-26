import "./globals.css";
export const metadata = { title: "Coach Hours", description: "Coach hours and invoicing" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
