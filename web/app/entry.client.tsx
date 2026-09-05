import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

function hydrate() {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <HydratedRouter />
      </StrictMode>
    );
  });
}

// React Router streams the document and loads this entry module with `async`,
// so it can start executing while the parser is still appending the trailing
// chunks (the loader-data scripts and the closing Suspense markers). Hydrating
// at that moment compares React's tree against a half-built DOM, which React
// reports as error #418 and recovers from by throwing away the server-rendered
// markup and re-rendering the whole page on the client. It only shows up over a
// real network, where those chunks arrive in separate packets; on localhost the
// whole document lands before this module runs.
//
// Waiting for parsing to finish removes the race. Nothing is suppressed: a
// genuine markup mismatch still reports normally.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", hydrate, { once: true });
} else {
  hydrate();
}
