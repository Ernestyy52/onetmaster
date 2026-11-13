import { useEffect, useRef, type ReactNode } from 'react';
import { ICON_INDEX, type IconName } from '../icons';

const BASE = import.meta.env.BASE_URL;

export function Icon({ name, size = 32, title }: { name: IconName | string; size?: number; title?: string }) {
  const i = ICON_INDEX[name as IconName] ?? 0;
  const scale = size / 32;
  return (
    <span
      className="icon"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${BASE}assets/icons/icons.png)`,
        backgroundSize: `${13 * 32 * scale}px ${size}px`,
        backgroundPosition: `${-i * size}px 0`,
      }}
    />
  );
}

export function Portrait({ appearance, size = 56 }: { appearance: 'swordsman' | 'mage'; size?: number }) {
  const scale = size / 48;
  return (
    <span
      className="portrait"
      aria-hidden
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${BASE}assets/sprites/player_${appearance}.png)`,
        backgroundSize: `${480 * scale}px ${256 * scale}px`,
        backgroundPosition: `0px ${-8 * scale}px`,
      }}
    />
  );
}

export function NpcPortrait({ kind, size = 64 }: { kind: string; size?: number }) {
  const map: Record<string, { file: string; w: number; h: number; fw: number; fh: number; oy: number }> = {
    owl: { file: 'owl.png', w: 96, h: 64, fw: 48, fh: 64, oy: 2 },
    enemy: { file: 'warden.png', w: 384, h: 112, fw: 96, fh: 112, oy: 6 },
  };
  const m = map[kind];
  if (!m) return null;
  const scale = size / m.fw;
  return (
    <span
      className="portrait npc"
      aria-hidden
      style={{
        width: size,
        height: Math.min(size * 1.1, m.fh * scale),
        backgroundImage: `url(${BASE}assets/sprites/${m.file})`,
        backgroundSize: `${m.w * scale}px ${m.h * scale}px`,
        backgroundPosition: `0px ${-m.oy * scale}px`,
      }}
    />
  );
}

export function Bar({ value, max, color, label, height = 10 }: { value: number; max: number; color: string; label: string; height?: number }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className="bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} style={{ height }}>
      <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Modal({
  title, onClose, children, wide, testId,
}: { title: ReactNode; onClose?: () => void; children: ReactNode; wide?: boolean; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    (root?.querySelector<HTMLElement>('[data-autofocus]') ?? root?.querySelector<HTMLElement>('button'))?.focus();
  }, []);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal panel ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" ref={ref} data-testid={testId}>
        <header className="modal-head">
          <h2>{title}</h2>
          {onClose && (
            <button className="btn icon-btn" onClick={onClose} aria-label="ปิด">
              ✕
            </button>
          )}
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
