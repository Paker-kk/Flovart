import React from 'react';

const join = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

export const WorkspaceSwitcher: React.FC<{
  activeView: string;
  onChangeView: (view: string) => void;
  className?: string;
}> = ({ activeView, onChangeView, className }) => (
  <div className={join('canvas-workspace-switcher', className)} role="tablist" aria-label="Workspace switcher">
    {[
      { key: 'canvas', label: 'Canvas' },
      { key: 'workflow', label: 'Workflow' },
    ].map((item) => {
      const active = item.key === activeView;
      return (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={active}
          className={join('canvas-workspace-switcher__tab', active && 'is-active')}
          onClick={() => onChangeView(item.key)}
        >
          {item.label}
        </button>
      );
    })}
  </div>
);

export const CanvasFloatingPanel: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => (
  <div className={join('canvas-floating-panel', className)} {...props}>
    {children}
  </div>
);

export const CanvasIconButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    active?: boolean;
    variant?: 'default' | 'primary';
  }
> = ({ active, variant = 'default', className, children, ...props }) => (
  <button
    type="button"
    className={join(
      'canvas-icon-button',
      variant === 'primary' && 'canvas-icon-button--primary',
      active && 'is-active',
      className,
    )}
    {...props}
  >
    {children}
  </button>
);
