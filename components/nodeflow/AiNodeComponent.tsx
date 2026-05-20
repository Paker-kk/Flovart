import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { SpatialNode } from '../../types';

const StatusDot = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    idle: '#444',
    queued: '#f0ad4e',
    running: '#5bc0de',
    completed: '#00ff88',
    failed: '#ff4444',
  };
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        backgroundColor: colors[status] || '#444',
      }}
    />
  );
};

const ProgressBar = ({ pct }: { pct: number }) => (
  <div style={{ width: '100%', height: 3, background: '#333', borderRadius: 2, marginTop: 4 }}>
    <div style={{ width: `${pct}%`, height: 3, background: '#00ff88', borderRadius: 2, transition: 'width 0.3s' }} />
  </div>
);

export const AiNodeComponent = memo(({ data }: { data: SpatialNode }) => {
  const isGenerating = data.execution.status === 'running';
  const progress = data.execution.progressPercent ?? 0;

  return (
    <div
      className={`ai-node-card status-${data.execution.status}`}
      style={{
        width: data.width || 340,
        minHeight: data.height || 220,
        background: '#1a1a2e',
        borderRadius: 12,
        border: `1.5px solid ${isGenerating ? '#00ff88' : data.execution.status === 'failed' ? '#ff4444' : '#333'}`,
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

      {/* Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          background: '#16213e',
          borderBottom: '1px solid #333',
        }}
      >
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#888' }}>
          {data.type.replace(/_/g, ' ')}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: '#aaa' }}>{data.meta.name}</span>
          <StatusDot status={data.execution.status} />
        </div>
      </header>

      {/* Body: Preview or skeleton */}
      <main
        style={{
          flex: 1,
          minHeight: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f0f1a',
          position: 'relative',
        }}
      >
        {data.outputs.mediaHref ? (
          data.outputs.mediaMimeType?.startsWith('video') ? (
            <video src={data.outputs.mediaHref} controls style={{ width: '100%', maxHeight: 200, objectFit: 'contain' }} />
          ) : (
            <img src={data.outputs.mediaHref} alt={data.meta.name} style={{ width: '100%', maxHeight: 200, objectFit: 'contain' }} />
          )
        ) : (
          <div style={{ textAlign: 'center', opacity: 0.3 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>
              {data.type === 'GENERATE_IMAGE' ? '🖼️' : data.type === 'GENERATE_VIDEO' ? '🎬' : data.type === 'STATIC_ASSET' ? '📦' : '📝'}
            </div>
            <span style={{ fontSize: 10, color: '#aaa' }}>
              {isGenerating ? 'Generating...' : data.execution.status === 'failed' ? 'Failed' : 'Ready'}
            </span>
          </div>
        )}

        {isGenerating && <ProgressBar pct={progress} />}

        {data.execution.status === 'failed' && (
          <div style={{ position: 'absolute', bottom: 4, left: 8, fontSize: 9, color: '#ff4444' }}>
            {data.outputs.errorMessage || 'Unknown error'}
          </div>
        )}
      </main>

      {/* Footer: prompt snippet */}
      <footer
        style={{
          padding: '6px 12px',
          background: '#16213e',
          borderTop: '1px solid #333',
          fontSize: 10,
          color: '#666',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {data.inputs.textPrompt
          ? data.inputs.textPrompt.slice(0, 80) + (data.inputs.textPrompt.length > 80 ? '...' : '')
          : 'No prompt set'}
      </footer>

      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
});
