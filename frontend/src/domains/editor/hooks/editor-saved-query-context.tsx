import { createContext, useContext, useMemo } from "react";

export interface EditorSavedQueryFolder {
  id: string;
  name: string;
}

interface EditorSavedQueryActionsValue {
  folders: EditorSavedQueryFolder[];
  handleSaveQuery: () => Promise<void>;
  handleSaveQueryAs: (
    title: string,
    description?: string,
    folderId?: string | null,
    isShared?: boolean,
  ) => Promise<void>;
  handleMoveToFolder: (folderId: string | null) => Promise<void>;
}

const EditorSavedQueryActionsContext = createContext<EditorSavedQueryActionsValue | null>(null);

const noopAsync = () => Promise.resolve();

export function EditorSavedQueryActionsProvider({
  value,
  children,
}: {
  value: EditorSavedQueryActionsValue;
  children: React.ReactNode;
}) {
  return (
    <EditorSavedQueryActionsContext.Provider value={value}>
      {children}
    </EditorSavedQueryActionsContext.Provider>
  );
}

function useFallbackValue(): EditorSavedQueryActionsValue {
  return useMemo(
    () => ({
      folders: [],
      handleSaveQuery: noopAsync,
      handleSaveQueryAs: noopAsync,
      handleMoveToFolder: noopAsync,
    }),
    [],
  );
}

export function useEditorSavedQueryActions(): EditorSavedQueryActionsValue {
  const value = useContext(EditorSavedQueryActionsContext);
  const fallback = useFallbackValue();
  return value ?? fallback;
}