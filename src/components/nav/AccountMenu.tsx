"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// The one persistent, unobtrusive navigation affordance across every
// logged-in page — deliberately not a full nav bar. Fixed to the viewport
// so it stays in the same spot regardless of each page's own layout/width.
export default function AccountMenu({ userEmail }: { userEmail: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initial = userEmail.trim().charAt(0).toUpperCase() || "?";

  const links = [
    { href: "/collection", label: "Vault" },
    { href: "/upload", label: "Upload" },
    { href: "/profile", label: "Profile" },
  ];

  return (
    <div ref={containerRef} className="fixed right-4 top-4 z-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-black/[.08] bg-white text-sm font-semibold text-black shadow-sm transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-40 overflow-hidden rounded-lg border border-black/[.08] bg-white py-1 shadow-lg dark:border-white/[.145] dark:bg-zinc-950">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-black/[.04] dark:text-zinc-300 dark:hover:bg-[#1a1a1a]"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
