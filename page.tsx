import { auth } from "@clerk/nextjs/server";

import { CaseDashboard } from "@/components/case-dashboard";

export default async function Home() {
  await auth.protect();
  return <main className="min-h-screen bg-slate-100 text-slate-950"><CaseDashboard /></main>;
}
