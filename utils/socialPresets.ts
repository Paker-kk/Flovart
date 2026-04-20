/**
 * Social-platform ratio presets mapped to the 6 existing VideoAspectRatio values.
 * No new ratios are introduced — each preset resolves to one of:
 *   '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9'
 */

export type VideoAspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9';

export interface SocialPreset {
  label: string;
  /** Mapping of use-case description → ratio */
  ratios: { desc: string; ratio: VideoAspectRatio }[];
}

export const SOCIAL_PRESETS: Record<string, SocialPreset> = {
  youtube: {
    label: 'YouTube',
    ratios: [
      { desc: '视频 / 横屏', ratio: '16:9' },
      { desc: 'Shorts', ratio: '9:16' },
    ],
  },
  instagram: {
    label: 'Instagram',
    ratios: [
      { desc: 'Reels / Story', ratio: '9:16' },
      { desc: '帖子', ratio: '1:1' },
      { desc: '横屏帖子', ratio: '4:3' },
    ],
  },
  tiktok: {
    label: 'TikTok / 抖音',
    ratios: [
      { desc: '视频', ratio: '9:16' },
    ],
  },
  xiaohongshu: {
    label: '小红书',
    ratios: [
      { desc: '竖屏笔记', ratio: '3:4' },
      { desc: '方形', ratio: '1:1' },
    ],
  },
  bilibili: {
    label: 'B站',
    ratios: [
      { desc: '视频', ratio: '16:9' },
      { desc: '竖屏', ratio: '9:16' },
    ],
  },
  wechat: {
    label: '微信视频号',
    ratios: [
      { desc: '竖屏视频', ratio: '9:16' },
      { desc: '横屏视频', ratio: '16:9' },
    ],
  },
  linkedin: {
    label: 'LinkedIn',
    ratios: [
      { desc: '视频', ratio: '16:9' },
      { desc: '方形', ratio: '1:1' },
    ],
  },
  x: {
    label: 'X (Twitter)',
    ratios: [
      { desc: '视频', ratio: '16:9' },
      { desc: '竖屏', ratio: '9:16' },
    ],
  },
  cinema: {
    label: '电影宽银幕',
    ratios: [
      { desc: '21:9 超宽', ratio: '21:9' },
    ],
  },
};
