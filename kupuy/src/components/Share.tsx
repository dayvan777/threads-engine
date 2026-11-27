"use client";
import { useState } from "react";

export function Share({ url, text, imageUrl, storyUrl }: { url: string; text: string; imageUrl?: string; storyUrl?: string }) {
  const [copied, setCopied] = useState(false);
  const full = typeof window !== "undefined" && url.startsWith("/") ? window.location.origin + url : url;
  const threads = `https://www.threads.net/intent/post?text=${encodeURIComponent(text + "\n" + full)}`;

  async function native() {
    try {
      if (navigator.share) {
        await navigator.share({ text, url: full });
        return;
      }
    } catch {
      return;
    }
    await navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="grid gap-2">
      <a className="btn" href={threads} target="_blank" rel="noopener">
        Поділитись у Threads
      </a>
      <div className="grid grid-cols-2 gap-2">
        {storyUrl && (
          <a className="btn btn-ghost text-[15px]" href={storyUrl} download="kupuy-vchasno.png">
            PNG для сторіс
          </a>
        )}
        <button type="button" className="btn btn-ghost text-[15px]" onClick={native}>
          {copied ? "Скопійовано ✓" : "Скопіювати лінк"}
        </button>
      </div>
      {imageUrl && <link rel="prefetch" href={imageUrl} />}
    </div>
  );
}
