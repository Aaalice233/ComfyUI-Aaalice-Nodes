# Stable parameter ids and break link rebinding

Users frequently add, remove, reorder, and rename parameters. Pure output-slot index alignment makes downstream links silently point at the wrong value after edits.

Each parameter has a hidden stable **Parameter Id**. The Param Pack keys values by id. ParameterBreak still exposes ordered slots (max 32), but after structure changes the frontend rebinds existing links by id so connections follow identity, not a fragile index.
