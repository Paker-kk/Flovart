import { create } from 'zustand';
import type { CanvasElement, ElementGenerationState, ImageElement, ShapeElement, TextElement, VideoElement } from '../types';
import { compilePromptReferences, syncReferencesOnRename } from '../utils/semanticCompiler';

type ElementMetaUpdates = Partial<Pick<CanvasElement, 'name' | 'x' | 'y' | 'width' | 'height'>>;
type AddElementPayload = (
  | Omit<ImageElement, 'generationState'>
  | Omit<VideoElement, 'generationState'>
  | Omit<TextElement, 'generationState'>
  | Omit<ShapeElement, 'generationState'>
) & { initialPrompt?: string };

interface BoardState {
  elements: CanvasElement[];
  errorLog: Record<string, string>;
  addElement: (element: AddElementPayload) => void;
  updateElementMeta: (id: string, updates: ElementMetaUpdates) => void;
  updateElementGeneration: (id: string, updates: Partial<ElementGenerationState>) => void;
  removeElement: (id: string) => void;
}

const generateUniqueElementName = (
  baseName: string,
  elementId: string,
  currentElements: CanvasElement[],
): string => {
  const trimmed = baseName.trim() || 'Untitled_Asset';
  let candidate = trimmed;
  let counter = 1;

  while (
    currentElements.some(
      (el) => el.id !== elementId && el.name?.trim().toLowerCase() === candidate.toLowerCase(),
    )
  ) {
    candidate = `${trimmed}_${counter}`;
    counter++;
  }

  return candidate;
};

export const useBoardStore = create<BoardState>((set) => ({
  elements: [],
  errorLog: {},

  addElement: (elementPayload) => set((state) => {
    const uniqueName = generateUniqueElementName(
      elementPayload.name || 'Untitled_Asset',
      elementPayload.id,
      state.elements,
    );

    const initializedGeneration: ElementGenerationState = {
      promptPayload: compilePromptReferences(
        elementPayload.initialPrompt || '',
        state.elements,
      ),
      provider: 'openrouter',
      modelId: 'flux-schnell',
      status: 'idle',
    };

    const { initialPrompt, ...elementWithoutPrompt } = elementPayload;
    const newElement: CanvasElement = {
      ...elementWithoutPrompt,
      name: uniqueName,
      generationState: initializedGeneration,
    } as CanvasElement;

    return {
      elements: [...state.elements, newElement],
    };
  }),

  updateElementMeta: (id, updates) => set((state) => {
    const targetIndex = state.elements.findIndex((element) => element.id === id);
    if (targetIndex === -1) return state;

    const oldElement = state.elements[targetIndex];
    let updatedElements = [...state.elements];
    let finalName = oldElement.name;

    if (updates.name && updates.name.trim() !== oldElement.name) {
      finalName = generateUniqueElementName(updates.name, id, state.elements);
      const oldName = oldElement.name;

      if (oldName) {
        updatedElements = updatedElements.map((element) => {
          if (element.id === id) return element;
          if (!element.generationState) return element;

          const synchronizedPayload = syncReferencesOnRename(
            oldName,
            finalName || 'Untitled_Asset',
            element.generationState.promptPayload,
          );

          return {
            ...element,
            generationState: {
              ...element.generationState,
              promptPayload: synchronizedPayload,
            },
          } as CanvasElement;
        });
      }
    }

    updatedElements[targetIndex] = {
      ...oldElement,
      ...updates,
      name: finalName,
    } as CanvasElement;

    return {
      elements: updatedElements,
    };
  }),

  updateElementGeneration: (id, updates) => set((state) => ({
    elements: state.elements.map((element) => {
      if (element.id !== id || !element.generationState) return element;

      let nextPayload = element.generationState.promptPayload;
      if (updates.promptPayload?.rawText !== undefined) {
        nextPayload = compilePromptReferences(
          updates.promptPayload.rawText,
          state.elements,
        );
      }

      return {
        ...element,
        generationState: {
          ...element.generationState,
          ...updates,
          promptPayload: nextPayload,
        },
      } as CanvasElement;
    }),
  })),

  removeElement: (id) => set((state) => {
    const target = state.elements.find((element) => element.id === id);
    if (!target) return state;

    const targetToken = `@${target.name}`;
    const missingReferenceText = `[引用已缺失:${target.name || id}]`;

    const cleanedElements = state.elements
      .filter((element) => element.id !== id)
      .map((element) => {
        if (!element.generationState || !element.generationState.promptPayload.rawText.includes(targetToken)) {
          return element;
        }

        const brokenText = element.generationState.promptPayload.rawText
          .split(targetToken)
          .join(missingReferenceText);

        return {
          ...element,
          generationState: {
            ...element.generationState,
            promptPayload: {
              rawText: brokenText,
              resolvedReferences: element.generationState.promptPayload.resolvedReferences.filter(
                (ref) => ref.targetElementId !== id,
              ),
            },
          },
        } as CanvasElement;
      });

    return {
      elements: cleanedElements,
    };
  }),
}));
