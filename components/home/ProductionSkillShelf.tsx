import { Button, Modal, Tag } from 'antd';
import { ArrowRight, BookOpen, Check, Copy, Download, ExternalLink, Globe, RefreshCw, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import skillCover from '../../tools/flovart/evaluations/vox-history-1776/contact-sheet-10.png';

import {
  listBundledProductionSkills,
  type BundledProductionSkill,
} from '../../services/productionSkillCatalog';
import { hubSkillExternalUrl } from '../../services/skillHubClient';
import { useSkillHubStore } from '../../stores/useSkillHubStore';
import { buildProductionSkillStarterPrompt, productionSkillHandle } from '../../services/productionSkillLaunch';

export interface SelectableSkill {
  id: string;
  version: string;
  displayName: string;
}

type ShelfSkillOrigin = 'bundled' | 'local' | 'hub';

interface ShelfSkill {
  key: string;
  origin: ShelfSkillOrigin;
  id: string;
  name: string;
  description: string;
  version: string | null;
  handle: string;
  sourceUrl?: string;
  license?: string;
  runtimeMinVersion?: string;
  capabilities?: readonly string[];
  gates?: readonly { id: string; type: string }[];
  installed: boolean;
  updateAvailable: boolean;
}

const LOCAL_REFRESH_INTERVAL_MS = 30_000;

function handleFor(id: string): string {
  return `$${id.split('.').at(-1) || id}`;
}

function skillDescription(origin: ShelfSkillOrigin): string {
  if (origin === 'bundled') return '内置示例：随 Flovart 发布，验证过的制作方法。';
  if (origin === 'local') return '本地已安装：可准备到 Workflow，再交给当前 Director Host。';
  return '来自外部 Skill Hub：可查看来源，或安装到本机 Skill 目录。';
}

export function ProductionSkillShelf({
  onUse,
}: {
  onUse: (skill: SelectableSkill) => void;
}) {
  const bundledSkills = listBundledProductionSkills();
  const {
    hubUrl,
    hubStatus,
    hubError,
    hubSkills,
    lastSyncedAt,
    localSkills,
    registryStatus,
    registryError,
    setHubUrl,
    syncHub,
    refreshLocal,
    installFromHub,
    uninstallSkill,
  } = useSkillHubStore();
  const [hubUrlDraft, setHubUrlDraft] = useState(hubUrl);
  const [selected, setSelected] = useState<ShelfSkill | null>(null);
  const [copiedSkillId, setCopiedSkillId] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => { void refreshLocal(); }, [refreshLocal]);
  useEffect(() => {
    const timer = setInterval(() => {
      void refreshLocal();
      if (useSkillHubStore.getState().hubUrl) void useSkillHubStore.getState().syncHub();
    }, LOCAL_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refreshLocal]);

  const hubUrlNormalized = useMemo(() => hubUrl.replace(/\/+$/, ''), [hubUrl]);
  const localProduction = useMemo(() => localSkills.filter(skill => skill.kind === 'production'), [localSkills]);
  const bundledId = bundledSkills[0]?.id || '';

  const shelfSkills = useMemo<ShelfSkill[]>(() => {
    const local: ShelfSkill[] = bundledSkills.map(skill => ({
      key: `bundled:${skill.id}`,
      origin: 'bundled',
      id: skill.id,
      name: skill.displayName,
      description: skill.description,
      version: skill.version,
      handle: productionSkillHandle(skill),
      sourceUrl: skill.sourceUrl,
      license: skill.license,
      runtimeMinVersion: skill.runtimeMinVersion,
      capabilities: skill.capabilities,
      gates: skill.gates,
      installed: true,
      updateAvailable: false,
    }));
    for (const skill of localProduction) {
      if (skill.id === bundledId) continue;
      local.push({
        key: `local:${skill.id}`,
        origin: 'local',
        id: skill.id,
        name: skill.name,
        description: skill.description || skillDescription('local'),
        version: skill.version,
        handle: handleFor(skill.id),
        installed: true,
        updateAvailable: false,
      });
    }
    return local;
  }, [bundledSkills, localProduction, bundledId]);

  const hubCards = useMemo<ShelfSkill[]>(() => hubSkills.map(skill => {
    const local = localProduction.find(item => item.id === skill.id);
    return {
      key: `hub:${skill.id}`,
      origin: 'hub',
      id: skill.id,
      name: skill.name,
      description: skill.description || skillDescription('hub'),
      version: skill.version,
      handle: handleFor(skill.id),
      installed: Boolean(local),
      updateAvailable: Boolean(local && local.version !== skill.version),
    };
  }), [hubSkills, localProduction]);

  const selectedStarterPrompt = selected && selected.origin !== 'hub'
    ? buildProductionSkillStarterPrompt({ id: selected.id, version: selected.version || '', displayName: selected.name })
    : '';
  const modalFooter: ReactNode[] = selected ? [
    selected.origin === 'bundled' && (
      <Button
        key="source"
        href={selected.sourceUrl}
        target="_blank"
        icon={<ExternalLink size={14} />}
      >
        查看上游源码
      </Button>
    ),
    selected.origin === 'local' && (
      <Button
        key="uninstall"
        danger
        icon={<Trash2 size={14} />}
        onClick={() => { void confirmUninstall(selected); }}
      >
        卸载
      </Button>
    ),
    selected.origin === 'hub' && (
      <Button
        key="hub"
        href={hubSkillExternalUrl(hubUrlNormalized, selected.id)}
        target="_blank"
        icon={<ExternalLink size={14} />}
      >
        在 Hub 查看
      </Button>
    ),
    selected.origin !== 'hub' && (
      <Button
        key="use"
        type="primary"
        onClick={() => {
          onUse({ id: selected.id, version: selected.version || '', displayName: selected.name });
          setSelected(null);
        }}
      >
        准备到 Workflow
      </Button>
    ),
    selected.origin === 'hub' && (
      <Button
        key="install"
        type="primary"
        icon={<Download size={14} />}
        disabled={installingId === selected.id || (selected.installed && !selected.updateAvailable)}
        onClick={() => void startInstall(selected)}
      >
        {installingId === selected.id ? '安装中…' : selected.installed ? (selected.updateAvailable ? '更新到本机' : '已安装') : '安装到本机'}
      </Button>
    ),
  ].filter(Boolean) : [];
  const copyStarterPrompt = async () => {
    if (!selected || !navigator.clipboard) return;
    await navigator.clipboard.writeText(selectedStarterPrompt);
    setCopiedSkillId(selected.id);
  };

  const confirmUninstall = async (skill: ShelfSkill) => {
    if (!window.confirm(`卸载本机 Skill「${skill.name}」？内置示例不可卸载。`)) return;
    try {
      await uninstallSkill(skill.id);
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : String(error));
    }
  };

  const startInstall = async (skill: ShelfSkill) => {
    setInstallingId(skill.id);
    setInstallError(null);
    try {
      await installFromHub(skill.id);
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : String(error));
    } finally {
      setInstallingId(null);
    }
  };

  const renderCardVisual = (skill: ShelfSkill) => (
    skill.origin === 'bundled'
      ? <img src={skillCover} alt="" />
      : <span className="home-skill-card__icon"><Sparkles size={18} /></span>
  );

  return (
    <section id="skill-hub" className="home-skill-shelf">
      <div className="home-skill-shelf__heading">
        <div>
          <span>PRODUCTION SKILL</span>
          <h3>选择一种制作方法</h3>
          <p>
            不用学习命令。选择后，我们会新建项目并准备推荐调用词；回到当前 Director Host 修改主题并发送即可。
          </p>
        </div>
        <a
          href="https://github.com/avabbbb/Flovart/blob/main/docs/overview/skill-guide.md"
          target="_blank"
          rel="noreferrer"
          className="home-skill-shelf__manual"
        >
          <BookOpen size={13} /> 使用手册
        </a>
      </div>

      <div className="home-skill-hub-config">
        <Globe size={14} />
        <input
          aria-label="Skill Hub 地址"
          placeholder="Skill Hub 地址（如 https://skills.example.com）"
          value={hubUrlDraft}
          onChange={event => setHubUrlDraft(event.target.value)}
          onBlur={() => { if (hubUrlDraft !== hubUrl) setHubUrl(hubUrlDraft); }}
        />
        <Button
          size="small"
          icon={<RefreshCw size={12} className={hubStatus === 'syncing' ? 'is-spinning' : ''} />}
          disabled={!hubUrlDraft || hubStatus === 'syncing'}
          onClick={() => { setHubUrl(hubUrlDraft); void syncHub(); }}
        >
          {hubStatus === 'syncing' ? '同步中…' : '同步 Hub'}
        </Button>
        {hubStatus === 'ready' && lastSyncedAt && (
          <span className="home-skill-hub-config__status is-ok">
            已同步 {hubSkills.length} 个 Skill
          </span>
        )}
        {hubStatus === 'error' && hubError && (
          <span className="home-skill-hub-config__status is-error">{hubError}</span>
        )}
      </div>

      <div className="home-skill-section">
        <div className="home-skill-section__heading">
          <span>本地已装（可直接使用）</span>
          {registryStatus === 'unavailable' && <em>连接桌面端可扫描本机 Skill 目录</em>}
          {registryStatus === 'error' && registryError && <em className="is-error">{registryError}</em>}
        </div>
        <div className="home-skill-grid">
          {shelfSkills.map(skill => (
            <button
              key={skill.key}
              type="button"
              aria-label={`了解并使用 ${skill.name}`}
              className="home-skill-card"
              onClick={() => {
                setSelected(skill);
                setCopiedSkillId(null);
                setInstallError(null);
              }}
            >
              <span className="home-skill-card__visual">
                {renderCardVisual(skill)}
                <i>{skill.origin === 'bundled' ? '内置示例' : '本地已装'}</i>
              </span>
              <span className="home-skill-card__body">
                <span><Sparkles size={15} /><strong>{skill.name}</strong><em>{skill.handle}</em></span>
                <small>{skill.description}</small>
                <b>{skill.version ? `v${skill.version}` : ''}{skill.origin === 'bundled' ? ' · 30 秒短片 · 确认后执行' : ' · 本机已安装'}</b>
              </span>
              <span className="home-skill-card__open">查看用法 <ArrowRight size={14} /></span>
            </button>
          ))}
          {shelfSkills.length === 0 && (
            <div className="home-skill-section__empty">本机还没有可用的 Production Skill。</div>
          )}
        </div>
      </div>

      {hubUrlNormalized && (
        <div className="home-skill-section">
          <div className="home-skill-section__heading">
            <span>来自 Skill Hub</span>
            <a href={hubUrlNormalized} target="_blank" rel="noreferrer">打开 Hub 站点 <ExternalLink size={11} /></a>
          </div>
          <div className="home-skill-grid">
            {hubCards.map(skill => (
              <div key={skill.key} className="home-skill-card is-hub">
                <span className="home-skill-card__visual">
                  <span className="home-skill-card__icon"><Globe size={18} /></span>
                  <i>{skill.installed ? (skill.updateAvailable ? '有更新' : '已安装') : 'Hub'}</i>
                </span>
                <span className="home-skill-card__body">
                  <span><Sparkles size={15} /><strong>{skill.name}</strong><em>{skill.handle}</em></span>
                  <small>{skill.description}</small>
                  <b>{skill.version ? `v${skill.version}` : ''} · 外部 Skill</b>
                </span>
                <span className="home-skill-card__actions">
                  <a
                    href={hubSkillExternalUrl(hubUrlNormalized, skill.id)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`在 Hub 查看 ${skill.name}`}
                  >
                    <ExternalLink size={13} /> 在 Hub 查看
                  </a>
                  <button
                    type="button"
                    disabled={installingId === skill.id || (skill.installed && !skill.updateAvailable)}
                    onClick={() => void startInstall(skill)}
                  >
                    <Download size={13} />
                    {installingId === skill.id ? '安装中…' : skill.installed ? (skill.updateAvailable ? '更新到本机' : '已安装') : '安装到本机'}
                  </button>
                </span>
              </div>
            ))}
            {hubCards.length === 0 && (
              <div className="home-skill-section__empty">
                {hubStatus === 'error' ? 'Hub 同步失败，请检查地址。' : hubStatus === 'syncing' ? '正在同步…' : 'Hub 暂无 Skill。'}
              </div>
            )}
          </div>
        </div>
      )}

      {installError && <div className="home-skill-install-error">{installError}</div>}

      <Modal
        open={Boolean(selected)}
        title={selected?.name}
        width={680}
        onCancel={() => setSelected(null)}
        footer={modalFooter}
      >
        {selected && (
          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap gap-2">
                <Tag color="cyan">{selected.origin === 'bundled' ? '内置示例' : selected.origin === 'local' ? '本地已装' : '外部 Hub'}</Tag>
                <Tag>{selected.handle}</Tag>
                {selected.version && <Tag>v{selected.version}</Tag>}
              </div>
              <p className="mt-3 text-sm leading-6" style={{ color: 'var(--isl-ink-soft)' }}>
                {selected.description}
              </p>
              {selected.origin === 'hub' && selected.installed && (
                <p className="mt-2 text-sm leading-6" style={{ color: 'var(--isl-mint-deep)' }}>
                  {selected.updateAvailable ? '本机已有旧版本，可一键更新。' : '该 Skill 已安装到本机，可直接在「本地已装」中选择。'}
                </p>
              )}
            </div>

            {selected.origin !== 'hub' && (
              <div
                className="rounded-xl p-4"
                style={{ background: 'var(--isl-surface-2)', border: '1px solid var(--isl-line)' }}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <strong className="block text-sm" style={{ color: 'var(--isl-ink)' }}>最简单的用法</strong>
                    <span className="text-xs" style={{ color: 'var(--isl-ink-soft)' }}>
                      直接描述也会自动匹配；保留 {selected.handle} 可以明确指定它。
                    </span>
                  </div>
                  <Button
                    size="small"
                    type="text"
                    icon={copiedSkillId === selected.id ? <Check size={14} /> : <Copy size={14} />}
                    onClick={() => void copyStarterPrompt()}
                  >
                    {copiedSkillId === selected.id ? '已复制' : '复制'}
                  </Button>
                </div>
                <div
                  className="rounded-lg px-3 py-2 text-xs leading-5"
                  style={{ background: 'var(--isl-surface)', color: 'var(--isl-ink)' }}
                >
                  {selectedStarterPrompt}
                </div>
              </div>
            )}

            <div
              className="flex items-start gap-3 rounded-xl p-3"
              style={{ background: 'var(--isl-mint-bg)', color: 'var(--isl-mint-deep)' }}
            >
              <ShieldCheck className="mt-0.5 shrink-0" size={17} />
              <div className="text-xs leading-5">
                {selected.origin === 'hub'
                  ? <><strong>安装/下载前请自行核对来源：</strong>Skill 来自外部 Hub 站点，本机只校验包结构、id 与版本；不要安装要求 API Key 或私密路由的包。下载到 Claude Code/Codex 请从 Hub 站页面操作。</>
                  : <><strong>点击后只会准备草稿：</strong>新建项目、打开 Workflow，并创建一张可编辑的制作简报；不会自动发送、调用 AI 服务或产生费用。确认内容后，可交给当前 AI Agent 继续推进。</>}
              </div>
            </div>

            {selected.origin !== 'hub' && (
              <details className="rounded-xl p-3" style={{ border: '1px solid var(--isl-line)' }}>
                <summary className="cursor-pointer text-xs font-bold" style={{ color: 'var(--isl-ink)' }}>
                  查看技术与安全信息
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Tag>{selected.id}</Tag>
                    {selected.version && <Tag>v{selected.version}</Tag>}
                    {selected.license && <Tag>{selected.license}</Tag>}
                    {selected.runtimeMinVersion && <Tag>Runtime ≥ {selected.runtimeMinVersion}</Tag>}
                  </div>
                  <p className="m-0 text-xs leading-5" style={{ color: 'var(--isl-ink-soft)' }}>
                    不读取 API Key、不直连 AI 服务、不运行私有轮询；只声明所需能力。
                  </p>
                  {selected.capabilities && selected.capabilities.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs font-bold" style={{ color: 'var(--isl-ink)' }}>制作能力</div>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.capabilities.map(capability => <Tag key={capability}>{capability}</Tag>)}
                      </div>
                    </div>
                  )}
                  {selected.gates && selected.gates.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs font-bold" style={{ color: 'var(--isl-ink)' }}>制作检查点</div>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.gates.map(gate => <Tag key={gate.id}>{gate.type}</Tag>)}
                      </div>
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
