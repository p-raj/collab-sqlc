import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import type { EditorSavedQueryFolder } from "../hooks/editor-saved-query-context";

const schema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  description: z.string().max(500).optional(),
  folder_id: z.string().optional(),
  is_shared: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

interface SaveQueryPopoverProps {
  sql: string;
  connectionId: string | null;
  folders: EditorSavedQueryFolder[];
  defaultTitle?: string;
  onClose: () => void;
  onSaved: (
    title: string,
    description?: string,
    folderId?: string | null,
    isShared?: boolean,
  ) => void;
}

export function SaveQueryPopover({ folders, onClose, onSaved, defaultTitle }: SaveQueryPopoverProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: defaultTitle ?? "",
      description: "",
      folder_id: "",
      is_shared: false,
    },
  });

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const onSubmit = async (values: FormValues) => {
    setIsSaving(true);
    setSaveError(null);
    try {
      onSaved(
        values.title,
        values.description || undefined,
        values.folder_id || null,
        values.is_shared ?? false,
      );
      onClose();
    } catch {
      setSaveError("Failed to save query");
    } finally {
      setIsSaving(false);
    }
  };

  const inputClasses =
    "h-7 w-full rounded border border-input bg-transparent px-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div
      ref={popoverRef}
      className="absolute left-0 top-full z-50 mt-1 w-64 rounded border border-input bg-card p-3 shadow-lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-2">
        <div>
          <input
            {...register("title")}
            placeholder="Query title *"
            className={inputClasses}
            autoFocus
          />
          {errors.title && (
            <p className="mt-0.5 text-[0.75rem] text-red-500">{errors.title.message}</p>
          )}
        </div>

        <input
          {...register("description")}
          placeholder="Description (optional)"
          className={inputClasses}
        />

        <select {...register("folder_id")} className={`${inputClasses} appearance-none`}>
          <option value="">No folder</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            {...register("is_shared")}
            className="h-3.5 w-3.5 rounded border-input"
          />
          Share with team
        </label>

        {saveError && <p className="text-[0.75rem] text-red-500">{saveError}</p>}

        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-input px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving && <Loader2 size={10} className="animate-spin" />}
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
