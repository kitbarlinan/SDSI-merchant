'use client';

import { useRef, useState } from 'react';
import { readSheetFile } from '@/lib/spreadsheet';

/** Choose an Excel or CSV file. Reads it in the browser and hands back the cell texts. */
export function SheetPicker({ label, onRead, onError }: { label: string; onRead: (sheet: string[][], fileName: string) => void; onError: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onRead(await readSheetFile(file), file.name);
      setName(file.name);
    } catch (error) {
      setName('');
      onError(error instanceof Error ? error.message : 'That file could not be read.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <input ref={input} type="file" accept=".xlsx,.csv" aria-label={label} className="sr-only" onChange={(event) => void pick(event.target.files?.[0])} />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {busy ? 'Reading…' : label}
      </button>
      {name ? <span className="text-xs text-slate-500">{name}</span> : null}
    </span>
  );
}
