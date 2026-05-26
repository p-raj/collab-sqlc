import { useCallback, useRef } from "react";
import { GripHorizontal } from "lucide-react";

interface ResizeHandleProps {
  onDrag: (deltaY: number) => void;
}

export function ResizeHandle({ onDrag }: ResizeHandleProps) {
  const startYRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startYRef.current = e.clientY;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientY - startYRef.current;
        startYRef.current = moveEvent.clientY;
        onDrag(delta);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [onDrag],
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      className="group flex h-1 flex-shrink-0 cursor-row-resize items-center justify-center border-y border-border bg-muted/50 transition-colors hover:bg-accent"
    >
      <GripHorizontal
        size={10}
        className="text-muted-foreground/40 group-hover:text-muted-foreground"
      />
    </div>
  );
}
