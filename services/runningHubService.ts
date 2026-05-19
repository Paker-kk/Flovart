// Stub for RunningHub WebApp service
// Generated to fix build error — full implementation pending

export interface RHWebAppNodeInfo {
  id: string;
  name: string;
  status: string;
}

export interface RHWebAppOutputItem {
  type: string;
  url?: string;
  text?: string;
  data?: string;
}

export interface RHWebAppTaskStatus {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  output?: RHWebAppOutputItem[];
}

export async function rhGetWebAppNodes(_appId: string, _apiKey?: string): Promise<RHWebAppNodeInfo[]> {
  console.warn('[RunningHub] Stub: rhGetWebAppNodes not implemented');
  return [];
}

export async function rhRunWebApp(
  _appId: string,
  _inputs: Record<string, string>,
  _apiKey?: string,
): Promise<string> {
  console.warn('[RunningHub] Stub: rhRunWebApp not implemented');
  return '';
}

export async function rhUploadWebAppDataUrl(
  _appId: string,
  _dataUrl: string,
  _filename?: string,
  _apiKey?: string,
): Promise<string> {
  console.warn('[RunningHub] Stub: rhUploadWebAppDataUrl not implemented');
  return '';
}
