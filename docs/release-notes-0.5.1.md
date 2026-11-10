Zyi 0.5.1 makes Claude permission preferences easier to save and fixes unclear launch-argument errors.

- Select **Claude Code**, then check **Skip Claude permission prompts**. Zyi adds `--dangerously-skip-permissions` without requiring JSON entry. The choice is preserved in saved sessions and templates; existing argument lists remain compatible.
- Invalid arguments now identify **Arguments** or **Custom resume arguments**, open the relevant section, and focus the field. Comma/quote errors no longer appear without context. Correcting the fields clears stale errors.
- Empty or whitespace-only argument fields mean no arguments. Invalid arrays are rejected before a process starts. The checkbox preserves unrelated arguments and removes its Claude-specific flag if you change to another session type.

The array `["--dangerously-skip-permissions"]` remains valid. Curly quotation marks are not valid JSON delimiters, and a malformed second JSON field can block launch even when the first field is correct. This release does not silently rewrite argument values.

Quit Zyi before upgrading. Existing workspaces and templates are retained. Windows x64, macOS Apple Silicon and Intel packages are included, with checksums. Preview signing remains unchanged: Windows unsigned; macOS ad-hoc signed and not notarized. See the desktop setup guide for installation and macOS folder permissions.
