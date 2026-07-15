# Workflow serialization is the source of truth for panel parameters

Status: Accepted.

The legacy design kept parameter state in process-global server memory synced over HTTP. That breaks after restart, confuses multi-worker setups, and diverges from what is saved in the workflow.

The ordered parameter definitions and values live in ParameterPanel node properties. Prompt serialization injects one parameter payload only for execution; the backend builds the 32 direct outputs from that payload. No process-global service state participates.
