# Isolated preview: online-status feed

The production WireGuard container remains the sole owner of `wg0`. The preview UI must **not** join its network namespace or mount the production DB/config. Keep `WGUI_MANAGE_START=false`, `WGUI_MANAGE_RESTART=false`, and drop all capabilities in the preview container.

For online filtering only, run `preview_online_feed.py` on the Docker host as the user in the `docker` group. It executes the read-only `docker exec wireguard wg show wg0 latest-handshakes` command and atomically writes `{generated_at_unix, peers}` into a private (0700) preview-status directory. The JSON contains **public** peer keys and handshake timestamps, never private keys. Mount only this directory read-only at `/run/preview-status` in the preview container and set `WGUI_STATUS_SNAPSHOT_FILE=/run/preview-status/current.json`. Do not expose the file over HTTP; the authenticated `/api/clients/online-status` endpoint publishes only the keys seen online.

Refresh the host snapshot at most once per minute while preview is in use. The endpoint rejects files older than 90 seconds or missing/invalid snapshots; clients then show **Unknown**, not Offline. Online means the last handshake is under three minutes old, matching the upstream Status page. This is only a handshake approximation, not proof that an application is reachable.

When retiring the preview: remove its exact snapshot-refresh cron entry, stop/remove only the preview container, remove the preview-only status files, and confirm production UI and `wg0` retained their IDs and peer count. Never run `docker compose down` on the WireGuard project for preview cleanup.
