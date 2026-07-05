import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/shared/components/ui/Button";
import { Checkbox } from "@/shared/components/ui/Checkbox";
import { Field, FieldError } from "@/shared/components/ui/Field";
import { Input } from "@/shared/components/ui/Input";
import { Select } from "@/shared/components/ui/Select";
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

  return (
    <div
      ref={popoverRef}
      className="absolute left-0 top-full z-50 mt-1 w-64 rounded border border-input bg-card p-3 shadow-lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-2">
        <Field>
          <Input
            {...register("title")}
            placeholder="Query title *"
            size="sm"
            autoFocus
          />
          <FieldError>{errors.title?.message}</FieldError>
        </Field>

        <Input
          {...register("description")}
          placeholder="Description (optional)"
          size="sm"
        />

        <Select {...register("folder_id")} size="sm" className="appearance-none">
          <option value="">No folder</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox {...register("is_shared")} />
          Share with team
        </label>

        <FieldError>{saveError}</FieldError>

        <div className="flex justify-end gap-1.5">
          <Button
            type="button"
            onClick={onClose}
            size="xs"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            loading={isSaving}
            variant="primary"
            size="xs"
          >
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}
