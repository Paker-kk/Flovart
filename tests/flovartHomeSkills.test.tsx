import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import FlovartHome from '../components/home/FlovartHome';
import { useWorkflowStore } from '../components/workflow/store';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useSkillHubStore } from '../stores/useSkillHubStore';

describe('Flovart Home Skill 台', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.hash = '';
    useWorkflowStore.setState({ projects: [], activeProjectId: null, hydrated: true });
    useWorkspaceStore.setState({ activeView: 'workflow' });
    useSkillHubStore.setState({
      hubUrl: '',
      hubStatus: 'idle',
      hubError: undefined,
      hubSkills: [],
      lastSyncedAt: undefined,
      localSkills: [],
      registryStatus: 'idle',
      registryError: undefined,
      lastRefreshedAt: undefined,
    });
  });

  it('shows the bundled VOX example and opens its verified package details', () => {
    render(<FlovartHome />);

    expect(screen.getByRole('heading', { name: '选择一种制作方法' })).toBeInTheDocument();
    expect(screen.getByText('不用学习命令。选择后，我们会新建项目并准备推荐调用词；回到当前 Director Host 修改主题并发送即可。')).toBeInTheDocument();
    expect(screen.getByText('VOX Skill')).toBeInTheDocument();
    expect(screen.queryByText('导演 Skill')).not.toBeInTheDocument();
    expect(screen.getByText('内置示例')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '了解并使用 VOX Skill' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('community.vox-director');
    expect(screen.getByRole('dialog')).toHaveTextContent('不读取 API Key');
    expect(screen.getByRole('dialog')).toHaveTextContent('查看上游源码');
    expect(screen.getByRole('dialog')).toHaveTextContent('$vox-director');
    expect(screen.getByRole('dialog')).toHaveTextContent('创建一张可编辑的制作简报');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Managed Agent');
  }, 20_000);

  it('creates a project with an editable Production Brief and opens Workflow', () => {
    render(<FlovartHome />);

    fireEvent.click(screen.getByRole('button', { name: '了解并使用 VOX Skill' }));
    fireEvent.click(screen.getByRole('button', { name: '准备到 Workflow' }));

    const project = useWorkflowStore.getState().projects[0];
    expect(project.title).toBe('VOX Skill 示例');
    expect(project.nodes).toHaveLength(1);
    expect(project.nodes[0]).toMatchObject({
      title: 'Production Brief',
      type: 'text',
      metadata: { content: expect.stringContaining('$vox-director') },
    });
    expect(useWorkspaceStore.getState().activeView).toBe('workflow');
    expect(localStorage.getItem('flovart.workflow.agent.mode')).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(window.location.hash).toBe('#/app');
  }, 20_000);

  it('exposes a semantic desktop shell with real workspace entries and an idea composer', () => {
    render(<FlovartHome />);

    expect(screen.getByRole('navigation', { name: '首页导航' })).toBeInTheDocument();
    for (const label of ['首页', '新建项目', 'Workflow', 'Table', 'Agent', 'Skill']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('textbox', { name: '创作想法' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '空白 Workflow' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发送' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /一张 Workflow/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /轻量视频节点/ })).toBeInTheDocument();
    expect(screen.queryByText('FlovartTV')).not.toBeInTheDocument();
  }, 20_000);

  it('turns a homepage idea into a real text node and opens Workflow', () => {
    render(<FlovartHome />);

    fireEvent.change(screen.getByRole('textbox', { name: '创作想法' }), { target: { value: '做一个关于城市夜雨的 30 秒短片' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    const project = useWorkflowStore.getState().projects[0];
    expect(project.title).toBe('做一个关于城市夜雨的 30 秒短片');
    expect(project.nodes).toHaveLength(1);
    expect(project.nodes[0]).toMatchObject({ type: 'text', metadata: { content: '做一个关于城市夜雨的 30 秒短片' } });
    expect(useWorkspaceStore.getState().activeView).toBe('workflow');
    expect(window.location.hash).toBe('#/app');
  }, 20_000);

  it('redirects hub skills to the external site and offers local install', () => {
    useSkillHubStore.setState({
      hubUrl: 'https://skills.example.com',
      hubStatus: 'ready',
      hubSkills: [
        { id: 'community.demo', name: 'Demo Skill', version: '2.0.0', description: '来自 Hub 的示例' },
      ],
      lastSyncedAt: Date.now(),
    });
    render(<FlovartHome />);

    expect(screen.getByText('来自 Skill Hub')).toBeInTheDocument();
    expect(screen.getByText('Demo Skill')).toBeInTheDocument();
    const hubLink = screen.getByRole('link', { name: '在 Hub 查看 Demo Skill' });
    expect(hubLink).toHaveAttribute('href', 'https://skills.example.com/skills/community.demo');
    expect(hubLink).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('button', { name: '安装到本机' })).toBeInTheDocument();
  }, 20_000);

  it('lists locally installed production skills next to the bundled example', () => {
    useSkillHubStore.setState({
      registryStatus: 'ready',
      localSkills: [
        {
          id: 'community.demo',
          name: '本地示例',
          description: '已装到本机的 Production Skill',
          version: '1.0.0',
          kind: 'production',
          trustTier: 'local-installed',
          location: 'project',
          packageDir: '/x/community.demo',
          contentHash: 'sha256:00',
          fileCount: 3,
        },
      ],
    });
    render(<FlovartHome />);

    expect(screen.getByText('本地已装（可直接使用）')).toBeInTheDocument();
    expect(screen.getByText('本地示例')).toBeInTheDocument();
    expect(screen.getByText('$demo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '了解并使用 本地示例' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('community.demo');
    expect(screen.getByRole('dialog')).toHaveTextContent('不读取 API Key');
    expect(screen.getByRole('button', { name: '准备到 Workflow' })).toBeInTheDocument();
  }, 20_000);
});
