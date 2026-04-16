(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.ResumeContentBridge = api;
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function () {
    "use strict";

    const CONTENT_SCRIPT_VERSION = "2026-04-16-selection-incremental-v4";

    function contentScriptHasDiagnosticsSupport(status) {
      return Boolean(
        status?.success &&
          status?.version === CONTENT_SCRIPT_VERSION &&
          status?.capabilities?.fullDiagnostics === true
      );
    }

    return {
      CONTENT_SCRIPT_VERSION,
      contentScriptHasDiagnosticsSupport,
    };
  }
);
