import { useEffect, useState } from 'react';

export function OfflineNotice() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);

  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener('online', markOnline);
    window.addEventListener('offline', markOffline);
    return () => {
      window.removeEventListener('online', markOnline);
      window.removeEventListener('offline', markOffline);
    };
  }, []);

  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-notice"
      className="flex min-h-8 shrink-0 items-center justify-center px-3 text-center text-[11px] font-semibold"
      style={{ color: 'var(--isl-ink-soft)', background: 'color-mix(in srgb, var(--isl-ink) 6%, var(--isl-surface-2))', borderBottom: '1px solid var(--isl-border)' }}
    >
      当前处于离线状态：本地项目、素材和画布仍可用；AI 服务与在线内容会在网络恢复后重试。
    </div>
  );
}
