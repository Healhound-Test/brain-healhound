import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Legal case tracker",
  description: "Track court orders, hearing dates, and follow-up actions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          <nav className="flex min-h-16 items-center justify-end gap-3 border-b border-slate-200 bg-white px-4 sm:px-6" aria-label="Account">
            <Show when="signed-out">
              <SignInButton>
                <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700" type="button">Sign in</button>
              </SignInButton>
              <SignUpButton>
                <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white" type="button">Sign up</button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </nav>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
