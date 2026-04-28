import type { NodeConfig, NodeKind } from './types';

export type NodeInspectorSectionId = 'identity' | 'runtime' | 'inputs';

type NodeConfigKey = keyof NodeConfig;

export interface NodeInspectorOption {
  value: string;
  label: string;
}

interface BaseInspectorField {
  key: NodeConfigKey;
  label: string;
  title: string;
  placeholder?: string;
}

export interface TextInspectorField extends BaseInspectorField {
  type: 'text';
  defaultValue?: string;
}

export interface TextareaInspectorField extends BaseInspectorField {
  type: 'textarea';
  defaultValue?: string;
  rows?: number;
}

export interface NumberInspectorField extends BaseInspectorField {
  type: 'number';
  allowEmpty?: boolean;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface SelectInspectorField extends BaseInspectorField {
  type: 'select';
  allowEmpty?: boolean;
  defaultValue?: string;
  emptyLabel?: string;
  options: NodeInspectorOption[];
}

export type NodeInspectorField =
  | TextInspectorField
  | TextareaInspectorField
  | NumberInspectorField
  | SelectInspectorField;

export interface NodeInspectorSection {
  id: NodeInspectorSectionId;
  title: string;
  fields: NodeInspectorField[];
}

const PROVIDER_OPTIONS: NodeInspectorOption[] = [
  { value: 'google', label: 'Google' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'runningHub', label: 'RunningHub' },
  { value: 'minimax', label: 'MiniMax' },
  { value: 'custom', label: 'Custom' },
];

const HTTP_METHOD_OPTIONS: NodeInspectorOption[] = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'DELETE', label: 'DELETE' },
];

const RH_RESOLUTION_OPTIONS: NodeInspectorOption[] = [
  { value: '1k', label: '1k' },
  { value: '2k', label: '2k' },
  { value: '4k', label: '4k' },
];

const ASSET_CATEGORY_OPTIONS: NodeInspectorOption[] = [
  { value: 'character', label: 'Character' },
  { value: 'scene', label: 'Scene' },
  { value: 'prop', label: 'Prop' },
];

const VIDEO_EDIT_MODE_OPTIONS: NodeInspectorOption[] = [
  { value: 'trim', label: 'Trim' },
  { value: 'replacePoster', label: 'Replace Poster' },
];

const IDENTITY_FIELDS = [
  {
    key: 'label',
    label: 'Label',
    type: 'text',
    title: 'Node label',
  },
] satisfies NodeInspectorField[];

const MODEL_RUNTIME_FIELDS = [
  {
    key: 'provider',
    label: 'Provider',
    type: 'select',
    title: 'Provider',
    allowEmpty: true,
    emptyLabel: 'Auto',
    options: PROVIDER_OPTIONS,
  },
  {
    key: 'model',
    label: 'Model',
    type: 'text',
    title: 'Model',
    placeholder: 'Leave blank to use workspace default',
  },
  {
    key: 'apiKeyRef',
    label: 'API Key Source',
    type: 'select',
    title: 'API key source',
    allowEmpty: true,
    emptyLabel: 'Auto',
    options: [],
  },
  {
    key: 'retryCount',
    label: 'Retry Count',
    type: 'number',
    title: 'Retry count',
    defaultValue: 0,
    min: 0,
    max: 5,
  },
  {
    key: 'timeoutMs',
    label: 'Timeout (ms)',
    type: 'number',
    title: 'Timeout in milliseconds',
    allowEmpty: true,
    min: 0,
    step: 100,
  },
] satisfies NodeInspectorField[];

const NETWORK_RUNTIME_FIELDS = [
  {
    key: 'apiKeyRef',
    label: 'API Key Source',
    type: 'select',
    title: 'API key source',
    allowEmpty: true,
    emptyLabel: 'Auto',
    options: [],
  },
  {
    key: 'retryCount',
    label: 'Retry Count',
    type: 'number',
    title: 'Retry count',
    defaultValue: 0,
    min: 0,
    max: 5,
  },
  {
    key: 'timeoutMs',
    label: 'Timeout (ms)',
    type: 'number',
    title: 'Timeout in milliseconds',
    allowEmpty: true,
    min: 0,
    step: 100,
  },
] satisfies NodeInspectorField[];

const UPSCALE_RUNTIME_FIELDS = [
  {
    key: 'model',
    label: 'Model',
    type: 'text',
    title: 'Upscale model',
    placeholder: 'RealESRGAN_x4plus',
  },
  ...NETWORK_RUNTIME_FIELDS,
] satisfies NodeInspectorField[];

const FACE_RESTORE_RUNTIME_FIELDS = [
  {
    key: 'model',
    label: 'Model',
    type: 'text',
    title: 'Face restore model',
    placeholder: 'CodeFormer',
  },
  ...NETWORK_RUNTIME_FIELDS,
] satisfies NodeInspectorField[];

const BG_REMOVE_RUNTIME_FIELDS = [
  {
    key: 'model',
    label: 'Model',
    type: 'text',
    title: 'Background removal model',
    placeholder: 'RMBG-2.0',
  },
  ...NETWORK_RUNTIME_FIELDS,
] satisfies NodeInspectorField[];

const INPUT_FIELDS_BY_KIND: Partial<Record<NodeKind, NodeInspectorField[]>> = {
  enhancer: [
    {
      key: 'systemPrompt',
      label: 'System Prompt',
      type: 'textarea',
      title: 'System prompt',
      rows: 6,
      placeholder: 'Control how this node rewrites incoming text',
    },
  ],
  llm: [
    {
      key: 'systemPrompt',
      label: 'System Prompt',
      type: 'textarea',
      title: 'System prompt',
      rows: 6,
      placeholder: 'Control how this node reasons over incoming text',
    },
  ],
  template: [
    {
      key: 'templateText',
      label: 'Template',
      type: 'textarea',
      title: 'Template text',
      rows: 6,
      placeholder: 'Use {{input}}, {{var1}}, {{var2}}',
    },
  ],
  loadVideo: [
    {
      key: 'videoSourceId',
      label: 'Video Source',
      type: 'select',
      title: 'Canvas video source',
      allowEmpty: true,
      emptyLabel: 'First canvas video',
      options: [],
    },
  ],
  videoEdit: [
    {
      key: 'videoEditMode',
      label: 'Edit Mode',
      type: 'select',
      title: 'Video edit operation',
      defaultValue: 'trim',
      options: VIDEO_EDIT_MODE_OPTIONS,
    },
    {
      key: 'trimInSec',
      label: 'Trim In (sec)',
      type: 'number',
      title: 'Trim start time',
      allowEmpty: true,
      min: 0,
      step: 0.1,
    },
    {
      key: 'trimOutSec',
      label: 'Trim Out (sec)',
      type: 'number',
      title: 'Trim end time',
      allowEmpty: true,
      min: 0,
      step: 0.1,
    },
  ],
  runningHub: [
    {
      key: 'rhEndpoint',
      label: 'Endpoint',
      type: 'text',
      title: 'RunningHub endpoint',
      placeholder: 'rhart-image-n-pro-official/edit',
    },
    {
      key: 'rhResolution',
      label: 'Resolution',
      type: 'select',
      title: 'RunningHub resolution',
      defaultValue: '2k',
      options: RH_RESOLUTION_OPTIONS,
    },
    {
      key: 'rhAspectRatio',
      label: 'Aspect Ratio',
      type: 'text',
      title: 'RunningHub aspect ratio',
      placeholder: '16:9',
    },
  ],
  httpRequest: [
    {
      key: 'httpMethod',
      label: 'Method',
      type: 'select',
      title: 'HTTP method',
      defaultValue: 'POST',
      options: HTTP_METHOD_OPTIONS,
    },
    {
      key: 'httpUrl',
      label: 'URL',
      type: 'text',
      title: 'HTTP URL',
      placeholder: 'https://api.example.com/endpoint',
    },
    {
      key: 'httpHeaders',
      label: 'Headers',
      type: 'textarea',
      title: 'HTTP headers JSON',
      rows: 4,
      placeholder: '{"Authorization":"Bearer ..."}',
    },
    {
      key: 'httpBodyTemplate',
      label: 'Body Template',
      type: 'textarea',
      title: 'HTTP request body template',
      rows: 5,
      placeholder: '{"input":"{{input}}"}',
    },
    {
      key: 'httpResultPath',
      label: 'Result Path',
      type: 'text',
      title: 'HTTP result extraction path',
      placeholder: 'data.result',
    },
  ],
  condition: [
    {
      key: 'conditionExpr',
      label: 'Condition',
      type: 'textarea',
      title: 'Condition expression',
      rows: 4,
      placeholder: "{{input}} contains 'error'",
    },
  ],
  upscale: [
    {
      key: 'scale',
      label: 'Scale',
      type: 'number',
      title: 'Upscale factor',
      defaultValue: 2,
      min: 1,
      max: 8,
      step: 1,
    },
    {
      key: 'workflowId',
      label: 'Workflow ID',
      type: 'text',
      title: 'RunningHub workflow ID',
      placeholder: 'Optional RunningHub workflow',
    },
  ],
  faceRestore: [
    {
      key: 'fidelity',
      label: 'Fidelity',
      type: 'number',
      title: 'Face restore fidelity',
      defaultValue: 0.5,
      min: 0,
      max: 1,
      step: 0.05,
    },
    {
      key: 'workflowId',
      label: 'Workflow ID',
      type: 'text',
      title: 'RunningHub workflow ID',
      placeholder: 'Optional RunningHub workflow',
    },
  ],
  bgRemove: [
    {
      key: 'workflowId',
      label: 'Workflow ID',
      type: 'text',
      title: 'RunningHub workflow ID',
      placeholder: 'Optional RunningHub workflow',
    },
  ],
  saveToAssets: [
    {
      key: 'assetCategory',
      label: 'Category',
      type: 'select',
      title: 'Asset library category',
      defaultValue: 'scene',
      options: ASSET_CATEGORY_OPTIONS,
    },
    {
      key: 'assetName',
      label: 'Asset Name',
      type: 'text',
      title: 'Saved asset name',
      placeholder: 'Workflow Asset',
    },
  ],
};

const RUNTIME_FIELDS_BY_KIND: Partial<Record<NodeKind, NodeInspectorField[]>> = {
  enhancer: MODEL_RUNTIME_FIELDS,
  llm: MODEL_RUNTIME_FIELDS,
  generator: MODEL_RUNTIME_FIELDS,
  imageGen: MODEL_RUNTIME_FIELDS,
  videoGen: MODEL_RUNTIME_FIELDS,
  runningHub: MODEL_RUNTIME_FIELDS,
  httpRequest: NETWORK_RUNTIME_FIELDS,
  upscale: UPSCALE_RUNTIME_FIELDS,
  faceRestore: FACE_RESTORE_RUNTIME_FIELDS,
  bgRemove: BG_REMOVE_RUNTIME_FIELDS,
};

export function getNodeInspectorSections(kind: NodeKind): NodeInspectorSection[] {
  const sections: NodeInspectorSection[] = [
    {
      id: 'identity',
      title: 'Identity',
      fields: IDENTITY_FIELDS,
    },
  ];

  const runtimeFields = RUNTIME_FIELDS_BY_KIND[kind];
  if (runtimeFields?.length) {
    sections.push({
      id: 'runtime',
      title: 'Runtime',
      fields: runtimeFields,
    });
  }

  const inputFields = INPUT_FIELDS_BY_KIND[kind];
  if (inputFields?.length) {
    sections.push({
      id: 'inputs',
      title: 'Inputs',
      fields: inputFields,
    });
  }

  return sections;
}
