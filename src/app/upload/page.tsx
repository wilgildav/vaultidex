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
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Upload knives
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Take two photos of your knives laid out side by side — one from
          the front, one from the back — using the numbered guides to line
          them up. You can photograph anywhere from 1 to 5 knives at a
          time; the guide shows 5 slots because that&apos;s the maximum,
          not a requirement.
        </p>
        <div className="mt-8">
          <UploadBatchForm userId={user.id} />
        </div>
      </div>
    </div>
  );
}
