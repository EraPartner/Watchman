import { useState } from "react";
import { Button } from "./Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./Dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  pending?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  pending: controlledPending,
}: ConfirmDialogProps) {
  const [internalPending, setInternalPending] = useState(false);
  const pending = controlledPending ?? internalPending;

  const handleConfirm = async () => {
    if (pending) return;
    try {
      if (controlledPending === undefined) setInternalPending(true);
      await onConfirm();
    } finally {
      if (controlledPending === undefined) setInternalPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="space-y-s-3">
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </div>
        <div className="mt-s-6 flex items-center justify-end gap-s-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="accent"
            onClick={handleConfirm}
            disabled={pending}
            className={
              destructive
                ? "bg-[var(--crit)] text-[var(--accent-contrast)] hover:brightness-110"
                : undefined
            }
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
