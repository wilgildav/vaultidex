import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UploadBatchForm from "@/components/upload/UploadBatchForm";

export default async function UploadPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-10 dark:bg-black">
      <div className="w-full max-w-xl">
        <Link
          href="/collection"
          className="w-fit text-sm text-zinc-600 underline hover:text-black dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          ← Back to Vault
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-black dark:text-zinc-50">
          Upload knives
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Take two photos — one from the front, one from the back — using
          the on-screen guide to line things up. Choose single-knife mode
          for one knife at a time, or batch mode for up to 5 laid out side
          by side.
        </p>
        <div className="mt-8">
          <UploadBatchForm userId={user.id} />
        </div>
      </div>
    </div>
  );
}
