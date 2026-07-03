<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Dev server / build cache

Never run `npm run build` or `npm run start` while `npm run dev` is active — they share the same `.next/` output directory, and Turbopack's persistent dev cache will corrupt mid-write, producing an "Internal Server Error" / Turbopack panic on every route until fixed. This has happened more than once.

If it happens: stop the dev server first, then `rm -rf .next` before starting anything else (dev or build). Don't try to build or start again while the corrupted dev server is still running.
