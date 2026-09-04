'use client';

import { DEFAULT_PERSONAS } from '@futuremode/shared/constants';
import type { Persona } from '@futuremode/shared';

interface Props {
  value: Persona['id'];
  onChange: (id: Persona['id']) => void;
  disabled?: boolean;
}

export function PersonaSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
      <span className="text-slate-500">AI 人格：</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Persona['id'])}
        disabled={disabled}
        className="border-none bg-transparent font-medium text-slate-800 outline-none disabled:opacity-50"
      >
        {(Object.values(DEFAULT_PERSONAS) as Array<typeof DEFAULT_PERSONAS.critic>).map((p) => (
          <option key={p.id} value={p.id}>
            {p.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}
