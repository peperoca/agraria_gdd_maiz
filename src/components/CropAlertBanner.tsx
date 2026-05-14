interface CropAlertBannerProps {
  type: 'info' | 'warning' | 'critical';
  message: string;
}

const STYLES: Record<string, { bg: string; color: string; icon: string }> = {
  info: { bg: 'var(--ib)', color: 'var(--it)', icon: 'info' },
  warning: { bg: '#fef3c7', color: '#92400e', icon: 'warning' },
  critical: { bg: 'var(--db)', color: 'var(--dt)', icon: 'error' },
};

export function CropAlertBanner({ type, message }: CropAlertBannerProps) {
  const style = STYLES[type] ?? STYLES.info;
  const iconMap: Record<string, string> = { info: 'ℹ️', warning: '⚠️', error: '❌' };

  return (
    <div
      className="text-xs p-2.5 rounded-[var(--r)] flex items-start gap-2"
      style={{ background: style.bg, color: style.color }}
    >
      <span className="text-sm shrink-0">{iconMap[style.icon]}</span>
      <span>{message}</span>
    </div>
  );
}
