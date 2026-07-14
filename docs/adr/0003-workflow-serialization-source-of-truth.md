# Workflow serialization is the source of truth for panel parameters

Status: Accepted.

The legacy design kept parameter state in process-global server memory synced over HTTP. That breaks after restart, confuses multi-worker setups, and diverges from what is saved in the workflow.

The ordered parameter definitions and values live in ParameterPanel node properties. Prompt serialization injects one parameter payload only for execution; the backend builds the 32 direct outputs from that payload. No process-global service state participates.

Operation Panel pages, sections, registration, and layout are namespaced workflow properties because they describe this workflow's operating surface. Page Value Presets live separately in ComfyUI's `user` storage and are import material, never the live workflow source of truth.
