import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
    {
      onRecoverableError(error, errorInfo) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes("418") ||
          message.includes("Hydration failed") ||
          message.includes("hydration")
        ) {
          console.warn("[hydration] recoverable mismatch:", error, errorInfo?.componentStack);
          return;
        }
        console.error("[react] recoverable error:", error, errorInfo);
      },
    }
  );
});
