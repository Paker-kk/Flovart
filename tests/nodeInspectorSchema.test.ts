import { describe, expect, it } from 'vitest';
import { getNodeInspectorSections } from '../components/nodeflow/inspectorSchema';

describe('getNodeInspectorSections', () => {
  it('builds Phase 2 runtime and input sections for llm nodes', () => {
    const sections = getNodeInspectorSections('llm');

    expect(sections.map((section) => section.id)).toEqual(['identity', 'runtime', 'inputs']);
    expect(sections[0]?.fields.map((field) => field.key)).toEqual(['label']);
    expect(sections[1]?.fields.map((field) => field.key)).toEqual(['provider', 'model', 'apiKeyRef', 'retryCount', 'timeoutMs']);
    expect(sections[2]?.fields.map((field) => field.key)).toEqual(['systemPrompt']);
  });

  it('includes the full HTTP request parameter surface in schema instead of hard-coded JSX branches', () => {
    const sections = getNodeInspectorSections('httpRequest');
    const runtimeSection = sections.find((section) => section.id === 'runtime');
    const inputSection = sections.find((section) => section.id === 'inputs');

    expect(runtimeSection?.fields.map((field) => field.key)).toEqual(['apiKeyRef', 'retryCount', 'timeoutMs']);
    expect(inputSection?.fields.map((field) => field.key)).toEqual([
      'httpMethod',
      'httpUrl',
      'httpHeaders',
      'httpBodyTemplate',
      'httpResultPath',
    ]);
  });

  it('keeps simple preview nodes on the minimal identity-only schema', () => {
    const sections = getNodeInspectorSections('preview');

    expect(sections.map((section) => section.id)).toEqual(['identity']);
    expect(sections[0]?.fields.map((field) => field.key)).toEqual(['label']);
  });

  it('exposes asset save settings without adding unnecessary runtime fields', () => {
    const sections = getNodeInspectorSections('saveToAssets');

    expect(sections.map((section) => section.id)).toEqual(['identity', 'inputs']);
    expect(sections[1]?.fields.map((field) => field.key)).toEqual(['assetCategory', 'assetName']);
  });

  it('exposes lightweight P3 video node controls in the schema', () => {
    const loadVideoSections = getNodeInspectorSections('loadVideo');
    const videoEditSections = getNodeInspectorSections('videoEdit');

    expect(loadVideoSections.map((section) => section.id)).toEqual(['identity', 'inputs']);
    expect(loadVideoSections[1]?.fields.map((field) => field.key)).toEqual(['videoSourceId']);
    expect(videoEditSections.map((section) => section.id)).toEqual(['identity', 'inputs']);
    expect(videoEditSections[1]?.fields.map((field) => field.key)).toEqual([
      'videoEditMode',
      'trimInSec',
      'trimOutSec',
    ]);
  });
});
