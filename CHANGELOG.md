# Local release history

## 1.0.1 — 2026-10-02

- Add a List/Table view switch to the Clients page, keeping the original cards as the default.
- Persist only the selected view in browser localStorage; render the same clients, search/status/subnet filtering, and management actions in both views.
- Render client-provided values safely in the new table and escape values interpolated into the existing cards.
- Add synthetic browser-DOM regression tests for filtering, view persistence, actions, and failed connection-status lookups. VPN peer configuration and the WireGuard service are unchanged.

This project is based on [ngoduykhanh/wireguard-ui](https://github.com/ngoduykhanh/wireguard-ui) at commit `2fdafd34ca6c8f7f1415a3a1d89498bb575a7171`.
