# Release runbook

Tagged releases are authoritative. Maintain [CHANGELOG.md](../CHANGELOG.md) and docs/release-notes-VERSION.md. Keep historical notes except factual corrections.

## Prepare

1. Land reviewed PRs with required checks and acceptance evidence.
2. A release PR updates package/lock versions, visible UI version, README download names, versioned notes and changelog.
3. Run npm run verify and npm run audit:deps. Inspect Windows x64, Mac arm64/x64 packaged checks and Windows install/reinstall/uninstall.
4. Run affected live-agent acceptance separately; record OS/CLI versions and account use. Mac permission/signing fixes need a real installed app tested across restart/upgrade. A temporary CI folder does not prove this.
5. Review migration backups, limitations and rollback. Unsigned/ad-hoc builds remain previews.

## Publish

After merge, verify the full main security scan passes before tagging the main commit with matching vVERSION and pushing. PR analysis may omit unchanged findings; a green PR scan is not proof the full tree is clean. Never retag a published release. If a tag fails release validation, fix forward with a new version and record the unpublished tag.

Desktop CI verifies tag/package/lock/UI/changelog/notes consistency, main ancestry and dependencies; builds/tests natively; validates all five package assets; then publishes preview notes and SHA256SUMS.txt. Only publication has write access. PR jobs have no signing credentials.

Maintenance-only PRs need no version bump or installer release. If publication fails before a release exists, rerun the failed job. Inspect partial/draft releases manually; automation must fail instead of replacing a published asset.

## Recovery

Stop distribution of a bad build and identify affected versions in release notes. Prefer a fix-forward patch. To roll back: quit Zyi, copy the entire workspace to backup, verify format compatibility, then install the older artifact. Restore older data only on explicit user direction because later work may be lost.

Keep installers/checksums available. Uninstall never removes projects, agent history or workspace data. Never replay an uncertain terminal delivery automatically.

## Signing dependency

Developer ID/notarization and Windows certificates are not configured. Credentials belong in protected CI environments, never source or PR jobs. Stable distribution requires signature verification and upgrade permission tests, not merely toggling build settings. See F12/F13 in [features](features.md).
