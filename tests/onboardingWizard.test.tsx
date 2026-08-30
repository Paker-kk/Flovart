import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingWizard } from '../components/OnboardingWizard';

describe('first-run AI service setup', () => {
  it('shows the minimal compatible-service fields before advanced options', () => {
    render(
      <OnboardingWizard
        isOpen
        onClose={vi.fn()}
        onAddApiKey={vi.fn()}
        resolvedTheme="light"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /开始配置/ }));

    expect(screen.getByLabelText(/服务地址/)).toBeInTheDocument();
    expect(screen.getByLabelText('API Key')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '连接' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /高级设置/ })).toBeInTheDocument();
    expect(screen.queryByText('支持的能力')).not.toBeInTheDocument();
  });
});
