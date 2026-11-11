// PROTOTYPE: floating variant switcher for throwaway UI prototypes. Never merge to main.
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router";

const STORAGE_KEY = "prototype-variant";

/** ?variant= wins; otherwise the last variant picked (survives navigation). */
export function usePrototypeVariant(keys: string[]) {
  const [params] = useSearchParams();
  const fromUrl = params.get("variant");
  const [stored, setStored] = useState<string | null>(null);

  useEffect(() => {
    if (fromUrl && keys.includes(fromUrl)) {
      localStorage.setItem(STORAGE_KEY, fromUrl);
      setStored(fromUrl);
    } else {
      setStored(localStorage.getItem(STORAGE_KEY));
    }
  }, [fromUrl, keys]);

  const v = fromUrl ?? stored;
  return v && keys.includes(v) ? v : keys[0];
}

export function PrototypeSwitcher({
  variants,
  current,
  extra,
}: {
  variants: { key: string; name: string }[];
  current: string;
  extra?: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const idx = Math.max(
    0,
    variants.findIndex((v) => v.key === current)
  );

  const go = (delta: number) => {
    const next = variants[(idx + delta + variants.length) % variants.length];
    const p = new URLSearchParams(params);
    p.set("variant", next.key);
    localStorage.setItem(STORAGE_KEY, next.key);
    navigate(`${location.pathname}?${p}`, { replace: true });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full bg-fuchsia-700 px-3 py-1.5 font-mono text-xs text-white shadow-xl ring-2 ring-white">
      <button onClick={() => go(-1)} className="px-1 text-base leading-none">
        ←
      </button>
      <span>
        PROTOTYPE {variants[idx].key} ({variants[idx].name})
      </span>
      <button onClick={() => go(1)} className="px-1 text-base leading-none">
        →
      </button>
      {extra}
    </div>
  );
}
