import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AuthCard from "@/components/auth/AuthCard";
import KnifeCarousel from "@/components/landing/KnifeCarousel";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/collection");
  }

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-zinc-50 px-4 dark:bg-black">
      <KnifeCarousel />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-50/40 via-zinc-50/70 to-zinc-50/40 dark:from-black/50 dark:via-black/75 dark:to-black/50" />
      <AuthCard />
    </div>
  );
}
