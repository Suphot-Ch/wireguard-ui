# Local release history

## 1.0.3 — 2026-10-02

- Add sortable client order (name, allocated IP, online-first, updated), persistent search, and independent config/online filters for both List and Table views.
- Show Online, Offline, or Unknown separately from Enabled/Disabled. Online means a WireGuard handshake within three minutes, consistent with the existing Status page; unavailable/stale data must never be labeled Offline.
- Add an authenticated read-only online-status API. Isolated preview may use a private, freshness-checked snapshot produced by a read-only host helper; production uses the local WireGuard interface. No peer configuration or tunnel lifecycle change.

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
