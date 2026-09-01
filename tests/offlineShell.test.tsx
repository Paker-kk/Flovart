import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OfflineNotice } from '../components/OfflineNotice';

const setOnline = (value: boolean) => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
  act(() => window.dispatchEvent(new Event(value ? 'online' : 'offline')));
};

afterEach(() => setOnline(true));

describe('offline shell', () => {
  it('keeps the local workspace usable and explains which remote features wait', () => {
    render(<OfflineNotice />);
    expect(screen.queryByTestId('offline-notice')).not.toBeInTheDocument();
    setOnline(false);
    expect(screen.getByTestId('offline-notice')).toHaveTextContent('本地项目、素材和画布仍可用');
    expect(screen.getByTestId('offline-notice')).toHaveTextContent('网络恢复后重试');
  });
});
