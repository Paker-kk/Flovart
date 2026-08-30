import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OnboardingWizard } from '../components/OnboardingWizard';
import { createFakeProviderServer } from '../scripts/fake-provider-server.mjs';

const servers: any[] = [];

async function startFakeProvider(mode?: string) {
  const server = createFakeProviderServer({ mode });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fake provider did not expose a port');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

describe('first-run AI service real HTTP flow', () => {
  it('saves discovered models after connecting an OpenAI-compatible service', async () => {
    const { origin } = await startFakeProvider();
    const onAddApiKey = vi.fn();
    render(<OnboardingWizard isOpen onClose={vi.fn()} onAddApiKey={onAddApiKey} resolvedTheme="light" />);

    fireEvent.click(screen.getByRole('button', { name: /开始配置/ }));
    fireEvent.change(screen.getByLabelText(/服务地址/), { target: { value: `${origin}/v1` } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'fake-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '连接' }));

    await waitFor(() => expect(onAddApiKey).toHaveBeenCalledTimes(1));
    expect(onAddApiKey).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'custom',
      baseUrl: `${origin}/v1`,
      defaultModel: 'gpt-image-2',
      models: expect.arrayContaining([
        expect.objectContaining({ id: 'gpt-image-2', capability: 'image' }),
        expect.objectContaining({ id: 'grok-imagine-video', capability: 'video' }),
      ]),
    }));
    expect(screen.getByText(/配置完成/)).toBeInTheDocument();
  });

  it('turns an unauthorized response into a product-language error', async () => {
    const { origin } = await startFakeProvider('unauthorized');
    const onAddApiKey = vi.fn();
    render(<OnboardingWizard isOpen onClose={vi.fn()} onAddApiKey={onAddApiKey} resolvedTheme="light" />);

    fireEvent.click(screen.getByRole('button', { name: /开始配置/ }));
    fireEvent.change(screen.getByLabelText(/服务地址/), { target: { value: `${origin}/v1` } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'wrong-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '连接' }));

    expect(await screen.findByText(/API Key 无效或没有访问权限/)).toBeInTheDocument();
    expect(onAddApiKey).not.toHaveBeenCalled();
  });
});
