import type { AdaptivePromptPayload, CanvasElement, ResolvedReference } from '../types';

const mentionRegex = /@([a-zA-Z0-9_\u4e00-\u9fa5-]+)/g;
const negationRegex = /(?:不要像|不要引入|排除|千万别像|not\s+like|exclude)[^@]*?(@[a-zA-Z0-9_\u4e00-\u9fa5-]+)/gi;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const replaceExactMentionToken = (text: string, oldToken: string, newToken: string): string => {
  const tokenPattern = new RegExp(`${escapeRegExp(oldToken)}(?![a-zA-Z0-9_\u4e00-\u9fa5-])`, 'g');
  return text.replace(tokenPattern, newToken);
};

export const compilePromptReferences = (
  rawText: string,
  allCanvasElements: CanvasElement[],
): AdaptivePromptPayload => {
  const payload: AdaptivePromptPayload = {
    rawText,
    resolvedReferences: [],
  };

  if (!rawText.trim()) return payload;

  const matches = [...rawText.matchAll(mentionRegex)];
  const references: ResolvedReference[] = [];

  for (const match of matches) {
    const fullToken = match[0];
    const elementName = match[1];

    const targetElement = allCanvasElements.find(
      (el) => el.name?.trim() === elementName.trim(),
    );

    if (targetElement) {
      const isDuplicate = references.some(
        (ref) => ref.targetElementId === targetElement.id,
      );

      if (!isDuplicate) {
        let mediaKind: 'image' | 'video' | 'text' = 'text';
        if (targetElement.type === 'image') mediaKind = 'image';
        if (targetElement.type === 'video') mediaKind = 'video';

        references.push({
          token: fullToken,
          targetElementId: targetElement.id,
          targetType: mediaKind,
        });
      }
    }
  }

  const negationMatches = [...rawText.matchAll(negationRegex)];
  const negatedTokens = negationMatches.map((match) => match[1]);

  payload.resolvedReferences = references.filter(
    (ref) => !negatedTokens.includes(ref.token),
  );

  return payload;
};

export const syncReferencesOnRename = (
  oldName: string,
  newName: string,
  targetPayload: AdaptivePromptPayload,
): AdaptivePromptPayload => {
  const oldToken = `@${oldName}`;
  const newToken = `@${newName}`;

  if (!targetPayload.rawText.includes(oldToken)) {
    return targetPayload;
  }

  const updatedRawText = replaceExactMentionToken(targetPayload.rawText, oldToken, newToken);
  const updatedReferences = targetPayload.resolvedReferences.map((ref) => {
    if (ref.token === oldToken) {
      return { ...ref, token: newToken };
    }

    return ref;
  });

  return {
    rawText: updatedRawText,
    resolvedReferences: updatedReferences,
  };
};
