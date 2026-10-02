package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/labstack/echo/v4"
	"golang.zx2c4.com/wireguard/wgctrl"
	"golang.zx2c4.com/wireguard/wgctrl/wgtypes"
)

const (
	onlineHandshakeWindow = 3 * time.Minute
	snapshotMaxAge        = 90 * time.Second
	statusSnapshotFileEnv = "WGUI_STATUS_SNAPSHOT_FILE"
)

type onlineStatusResponse struct {
	Available  bool     `json:"available"`
	Source     string   `json:"source"`
	AsOfUnix   int64    `json:"as_of_unix"`
	OnlineKeys []string `json:"online_keys"`
}

type onlineStatusSnapshot struct {
	GeneratedAtUnix int64            `json:"generated_at_unix"`
	Peers           map[string]int64 `json:"peers"`
}

func unavailableOnlineStatus() onlineStatusResponse {
	return onlineStatusResponse{Source: "unavailable", OnlineKeys: []string{}}
}

func isOnlineHandshake(handshake, now time.Time) bool {
	return !handshake.IsZero() && !handshake.After(now) && now.Sub(handshake) < onlineHandshakeWindow
}

func parseOnlineStatusSnapshot(data []byte, now time.Time) onlineStatusResponse {
	unavailable := unavailableOnlineStatus()
	var snapshot onlineStatusSnapshot
	if err := json.Unmarshal(data, &snapshot); err != nil || len(snapshot.Peers) == 0 {
		return unavailable
	}
	age := now.Sub(time.Unix(snapshot.GeneratedAtUnix, 0))
	if age < 0 || age > snapshotMaxAge {
		return unavailable
	}
	result := onlineStatusResponse{Available: true, Source: "preview_snapshot", AsOfUnix: snapshot.GeneratedAtUnix, OnlineKeys: []string{}}
	for key, timestamp := range snapshot.Peers {
		if isOnlineHandshake(time.Unix(timestamp, 0), now) && timestamp > 0 {
			result.OnlineKeys = append(result.OnlineKeys, key)
		}
	}
	sort.Strings(result.OnlineKeys)
	return result
}

func onlineStatusFromDevices(devices []*wgtypes.Device, now time.Time) onlineStatusResponse {
	if len(devices) == 0 {
		return unavailableOnlineStatus()
	}
	result := onlineStatusResponse{Available: true, Source: "live", AsOfUnix: now.Unix(), OnlineKeys: []string{}}
	seen := make(map[string]bool)
	for _, device := range devices {
		for _, peer := range device.Peers {
			key := peer.PublicKey.String()
			if isOnlineHandshake(peer.LastHandshakeTime, now) && !seen[key] {
				seen[key] = true
				result.OnlineKeys = append(result.OnlineKeys, key)
			}
		}
	}
	sort.Strings(result.OnlineKeys)
	return result
}

// OnlineClientStatus returns only peer public keys with recent handshakes.
func OnlineClientStatus() echo.HandlerFunc {
	return func(c echo.Context) error {
		now := time.Now()
		if path := os.Getenv(statusSnapshotFileEnv); path != "" {
			if !filepath.IsAbs(path) {
				return c.JSON(http.StatusOK, unavailableOnlineStatus())
			}
			data, err := os.ReadFile(path)
			if err != nil {
				return c.JSON(http.StatusOK, unavailableOnlineStatus())
			}
			return c.JSON(http.StatusOK, parseOnlineStatusSnapshot(data, now))
		}

		client, err := wgctrl.New()
		if err != nil {
			return c.JSON(http.StatusOK, unavailableOnlineStatus())
		}
		defer client.Close()
		devices, err := client.Devices()
		if err != nil {
			return c.JSON(http.StatusOK, unavailableOnlineStatus())
		}
		return c.JSON(http.StatusOK, onlineStatusFromDevices(devices, now))
	}
}
