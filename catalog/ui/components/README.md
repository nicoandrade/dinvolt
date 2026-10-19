# Editable Dinvolt UI catalog

`admin/` contains the Base UI Vega sources used by the default admin profile. `public/` contains the Base UI Luma sources used by the default public profile. Each profile has 65 catalog entries, including a `form` compatibility alias that installs `field`, plus the hooks and highlighter needed by those components.

Edit the ordinary files in each profile's `ui/`, `hooks/` and `lib/` directories. `registry.json` declares their dependencies and source paths; it does not embed another copy of the code. Dependencies are pinned to the versions verified with this snapshot. `upstream.json` records the official registry URL and hashes of the imported upstream sources. Keep `LICENSE.shadcn` with redistributed code.

Both profiles install the Dinvolt `spinner` from `catalog/registry/shared/spinner/spinner.tsx`. The vendored upstream implementations remain here as reference; their provenance hashes are preserved.

Both profiles support `size="xs" | "sm" | "default" | "lg"` on `Input` and `InputGroup`, matching Button heights of 24, 32, 36 and 40 px. The default remains 36 px. InputGroup icons scale to 12, 14, 16 and 20 px respectively, including icons nested in addon text and buttons; explicit icon `size-*` classes take precedence. Set the size on `InputGroup` to size its control and inline addons together; textarea and block-addon compositions retain automatic height. Input's `size` is a visual variant rather than the native HTML character-width attribute. Original upstream hashes remain unchanged as snapshot provenance.

The admin sidebar uses 18 px icons, 40 px default menu rows and collapsed squares, 36 px small rows/squares, and 48 px large rows that collapse to 40 px squares. Its compact width, actions, badges, submenus and skeletons follow those dimensions. Collapsed buttons center their first child (the icon or avatar) and keep the remaining labels available to screen readers without consuming space. The original imported hashes in `upstream.json` remain provenance for the upstream snapshot.

`dinvolt ui add button --target admin` reads this catalog, resolves its local dependency closure, then passes that payload to the pinned official shadcn CLI. The CLI still applies the selected profile's aliases, icons and CSS transforms. Only requested components and their dependencies are installed. Existing files retain the same overwrite rules. Admin panel dependencies use the same catalog. Styles other than the selected area's default use the official registry.

The internal playground uses this same resolver and updater. It installs the whole catalog in its disposable application and synchronizes source edits on save. Its example compositions are kept separately under `playground/` and are excluded from the published CLI.

Upstream changes are reviewed imports, not automatic updates at startup or build time. Keep intentional Dinvolt changes when updating a snapshot and run the full playground catalog check afterwards.
