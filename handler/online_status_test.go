package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
	"golang.zx2c4.com/wireguard/wgctrl/wgtypes"
)

func TestParseOnlineStatusSnapshotFresh(t *testing.T) {
	now := time.Unix(1700000100, 0)
	data := []byte(`{"generated_at_unix":1700000020,"peers":{"key-b":1700000000,"key-a":1699999921,"key-c":0}}`)
	got := parseOnlineStatusSnapshot(data, now)
	want := onlineStatusResponse{Available: true, Source: "preview_snapshot", AsOfUnix: 1700000020, OnlineKeys: []string{"key-a", "key-b"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatal("snapshot response mismatch")
	}
}

func TestParseOnlineStatusSnapshotExpired(t *testing.T) {
	now := time.Unix(1700000100, 0)
	got := parseOnlineStatusSnapshot([]byte(`{"generated_at_unix":1700000009,"peers":{"key-a":1700000000}}`), now)
	assertUnavailableOnlineStatus(t, got)
}

func TestParseOnlineStatusSnapshotInvalid(t *testing.T) {
	now := time.Unix(1700000100, 0)
	for name, data := range map[string]string{
		"malformed":         `{not json`,
		"empty peers":       `{"generated_at_unix":1700000100,"peers":{}}`,
		"missing timestamp": `{"peers":{"key-a":1700000000}}`,
		"future timestamp":  `{"generated_at_unix":1700000101,"peers":{"key-a":1700000000}}`,
	} {
		t.Run(name, func(t *testing.T) {
			assertUnavailableOnlineStatus(t, parseOnlineStatusSnapshot([]byte(data), now))
		})
	}
}

func TestHandshakeOnlineThreshold(t *testing.T) {
	now := time.Unix(1700000100, 0)
	for name, tc := range map[string]struct {
		handshake time.Time
		want      bool
	}{
		"recent":       {now.Add(-179 * time.Second), true},
		"at threshold": {now.Add(-180 * time.Second), false},
		"never":        {time.Time{}, false},
		"future":       {now.Add(time.Second), false},
	} {
		t.Run(name, func(t *testing.T) {
			if got := isOnlineHandshake(tc.handshake, now); got != tc.want {
				t.Fatalf("isOnlineHandshake = %t, want %t", got, tc.want)
			}
		})
	}
}

func TestOnlineStatusUnavailableJSONShape(t *testing.T) {
	got := unavailableOnlineStatus()
	assertUnavailableOnlineStatus(t, got)
	data, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != `{"available":false,"source":"unavailable","as_of_unix":0,"online_keys":[]}` {
		t.Fatal("unexpected unavailable JSON shape")
	}
}

func TestOnlineStatusFromDevicesUnavailableWithoutDevices(t *testing.T) {
	assertUnavailableOnlineStatus(t, onlineStatusFromDevices(nil, time.Unix(1700000100, 0)))
}

func TestOnlineStatusFromDevicesFiltersAndDeduplicates(t *testing.T) {
	now := time.Unix(1700000100, 0)
	key, err := wgtypes.GeneratePrivateKey()
	if err != nil {
		t.Fatal(err)
	}
	peer := wgtypes.Peer{PublicKey: key.PublicKey(), LastHandshakeTime: now.Add(-time.Minute)}
	devices := []*wgtypes.Device{{Peers: []wgtypes.Peer{peer}}, {Peers: []wgtypes.Peer{peer}}}
	want := onlineStatusResponse{Available: true, Source: "live", AsOfUnix: now.Unix(), OnlineKeys: []string{peer.PublicKey.String()}}
	if got := onlineStatusFromDevices(devices, now); !reflect.DeepEqual(got, want) {
		t.Fatal("live status mismatch")
	}
}

func TestOnlineClientStatusSnapshotOverride(t *testing.T) {
	path := filepath.Join(t.TempDir(), "status.json")
	now := time.Now().Unix()
	data, err := json.Marshal(onlineStatusSnapshot{GeneratedAtUnix: now, Peers: map[string]int64{"example-public-key": now}})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv(statusSnapshotFileEnv, path)
	e := echo.New()
	recorder := httptest.NewRecorder()
	context := e.NewContext(httptest.NewRequest(http.MethodGet, "/api/clients/online-status", nil), recorder)
	if err := OnlineClientStatus()(context); err != nil {
		t.Fatal(err)
	}
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", recorder.Code)
	}
	var got onlineStatusResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if !got.Available || got.Source != "preview_snapshot" || got.AsOfUnix != now || !reflect.DeepEqual(got.OnlineKeys, []string{"example-public-key"}) {
		t.Fatal("unexpected override status")
	}
}

func TestOnlineClientStatusMissingSnapshotDoesNotFallBackToLive(t *testing.T) {
	t.Setenv(statusSnapshotFileEnv, filepath.Join(t.TempDir(), "missing.json"))
	e := echo.New()
	recorder := httptest.NewRecorder()
	context := e.NewContext(httptest.NewRequest(http.MethodGet, "/api/clients/online-status", nil), recorder)
	if err := OnlineClientStatus()(context); err != nil {
		t.Fatal(err)
	}
	var got onlineStatusResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	assertUnavailableOnlineStatus(t, got)
}

func assertUnavailableOnlineStatus(t *testing.T, got onlineStatusResponse) {
	t.Helper()
	want := onlineStatusResponse{Available: false, Source: "unavailable", AsOfUnix: 0, OnlineKeys: []string{}}
	if !reflect.DeepEqual(got, want) {
		t.Fatal("expected unavailable response")
	}
}
