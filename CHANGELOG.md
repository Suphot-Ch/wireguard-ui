# Local release history

## 1.0.2 — 2026-10-02

- Keep Table mode a real, horizontally scrollable table on phones instead of restyling its rows as cards.
- Replace the table's crowded per-row controls with one Actions button. The client-specific modal retains Download, QR, Email, Telegram (when available), Edit, Enable/Disable, and Delete; it hands off to existing confirmation/edit dialogs after closing.
- Verify phone layout and modal handoff in a browser with synthetic peers; production WireGuard remains untouched.

## 1.0.1 — 2026-10-02

- Add a List/Table view switch to the Clients page, keeping the original cards as the default.
- Persist only the selected view in browser localStorage; render the same clients, search/status/subnet filtering, and management actions in both views.
- Render client-provided values safely in the new table and escape values interpolated into the existing cards.
- Add synthetic browser-DOM regression tests for filtering, view persistence, actions, and failed connection-status lookups. VPN peer configuration and the WireGuard service are unchanged.
- Pin shell-script/Dockerfile line endings to LF so Windows exports keep the Alpine image entrypoint executable.

This project is based on [ngoduykhanh/wireguard-ui](https://github.com/ngoduykhanh/wireguard-ui) at commit `2fdafd34ca6c8f7f1415a3a1d89498bb575a7171`.
