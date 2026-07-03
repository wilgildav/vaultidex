import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AccountMenu from "@/components/nav/AccountMenu";
import LogoutButton from "@/components/LogoutButton";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-10 dark:bg-black">
      <AccountMenu userEmail={user.email ?? ""} />
      <div className="w-full max-w-xl">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Profile</h1>

        <div className="mt-6 flex flex-col gap-6 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</span>
            <span className="text-sm text-black dark:text-zinc-50">{user.email}</span>
          </div>

          <div className="border-t border-black/[.08] pt-6 dark:border-white/[.145]">
            <LogoutButton />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-1 rounded-lg border border-dashed border-black/[.15] p-6 text-center dark:border-white/[.2]">
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Account settings and subscription details
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">Coming soon.</p>
        </div>
      </div>
    </div>
  );
}
