Zyi 0.5 improves everyday use of multiple CLI sessions.

- Create sessions from reusable templates. Save a group's project folder once, then start sessions from its ＋ button. Desktop includes Browse; advanced launch options are separate.
- Claude receives the session name at launch. Expand its connection details for hook health, conversation ID, config folder and resume instructions.
- Fix missing attention for empty completion events and long responses. Handle idle-prompt notifications as suggestions. Working indicators remain visible while older results await review.
- High, Normal and Low priorities now have text badges and colored card edges.
- Switching sessions restores the current terminal screen and cursor, fixing missing input borders after old output is truncated. Resize and replay are ordered.
- Setup covers macOS Files & Folders / Full Disk Access and Claude `/resume` troubleshooting.

Quit Zyi before installing. Existing sessions and saved data are retained. Choose Claude Code as the session type for its hooks; a plain shell does not install them. Use a current Claude CLI supporting `--name`. Renaming a running session applies to Claude on its next launch.

Windows x64: `.exe`. Apple Silicon: `mac-arm64.dmg`. Intel Mac: `mac-x64.dmg`. Mac ZIP alternatives and SHA256 checksums are included.

Preview signing is unchanged: Windows unsigned, macOS ad-hoc signed and not notarized. See the repository's desktop setup guide for first-launch access and permissions. Automated tests use real terminal/hook transport with deterministic fixtures; live Claude behavior on your installation remains a separate acceptance check. Automatic memory/skill extraction is not included.
