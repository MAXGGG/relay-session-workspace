Unpublished: the 0.5.2 tag failed its full security gate. No installers were released. These changes are included in [0.5.3](release-notes-0.5.3.md); the original prepared notes follow.

Zyi 0.5.2 fixes older Claude response cards staying in the attention queue after you reply.

- Submit a follow-up in the terminal or through **Reply…**: when connected Claude hooks report the prompt, earlier automatic response cards for that session move to **Handled**. The next response gets its own pending card, without retaining the previous response as pending.
- Simply opening the session or typing an unsent draft leaves the result pending. Background prompt events alone cannot acknowledge it. Errors, permission requests and manually classified items still need explicit handling. Handled entries remain available to reopen.
- The acknowledgement is scoped to items present when input was submitted and to the current process. Interrupted, expired and stale submissions cannot clear later responses. Acknowledging a response does not certify correctness or grant permission.
- Includes the repository maintenance foundation: documented features/roadmap, PR rules, enforced CI/security/native-build checks, and validated release assets/checksums.

This fix requires Claude hooks connected to Zyi. Other agents and plain Shell sessions retain their existing attention behavior. Automated coverage uses real PTYs, the shipped hook bridge and a deterministic Claude fixture; live Claude on macOS still needs user validation.

Quit Zyi before upgrading, install the matching Windows x64 or Mac arm64/x64 package, then reopen and resume your sessions. Existing records and pending entries are retained; your next submitted Claude follow-up can acknowledge older automatic result cards. No data migration is required. Windows remains unsigned; Mac builds remain ad-hoc signed and not notarized. Folder-permission and signing limitations are unchanged.
