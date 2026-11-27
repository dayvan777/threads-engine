"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBox({ initial = "" }: { initial?: string }) {
  const [q, setQ] = useState(initial);
  const router = useRouter();
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/poshuk?q=${encodeURIComponent(q.trim())}`);
      }}
      className="grid gap-2"
    >
      <label htmlFor="q" className="label">Посилання, назва або EAN</label>
      <div className="flex gap-2">
        <input
          id="q"
          className="field min-w-0 flex-1 text-[18px]"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="напр. AirPods Pro 3"
          enterKeyHint="search"
          autoComplete="off"
        />
        <button className="btn shrink-0 px-4" aria-label="Шукати">Шукати</button>
      </div>
    </form>
  );
}
