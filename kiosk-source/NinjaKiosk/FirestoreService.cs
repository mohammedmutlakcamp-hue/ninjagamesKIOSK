using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace NinjaKiosk;

/// <summary>
/// Lightweight Firestore REST API client — no SDK dependency.
/// Handles PC registration, heartbeat, status updates, and command polling.
/// </summary>
public class FirestoreService : IDisposable
{
    private const string ProjectId = "ninja-games-kiosk";
    private const string ApiKey = "AIzaSyBZc2a9hjuk4m1p1h2JiePqHRGTS7qhf74";
    private const string BaseUrl = $"https://firestore.googleapis.com/v1/projects/{ProjectId}/databases/(default)/documents";

    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(10) };
    private string? _idToken;
    private string? _refreshToken;
    private DateTime _tokenExpiry = DateTime.MinValue;

    // ── Auth (anonymous sign-in to satisfy Firestore rules) ──
    //
    // First call: creates an anonymous user via accounts:signUp.
    // Subsequent calls: uses the saved refreshToken to renew the SAME session
    // (same UID, same permissions) instead of creating a new anonymous user
    // every hour. This prevents the "goes offline after 1 hour" bug.

    public async Task AuthenticateAsync()
    {
        try
        {
            // If we have a refresh token, renew the session instead of creating a new user
            if (!string.IsNullOrEmpty(_refreshToken))
            {
                if (await RefreshTokenAsync()) return;
                // Refresh failed — fall through to create a new anonymous user
                App.Log("FIREBASE_REFRESH_FAILED — creating new session");
            }

            var url = $"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={ApiKey}";
            var body = new StringContent("{\"returnSecureToken\":true}", Encoding.UTF8, "application/json");
            var resp = await _http.PostAsync(url, body);
            var json = await resp.Content.ReadAsStringAsync();

            if (!resp.IsSuccessStatusCode)
            {
                App.Log($"FIREBASE_AUTH_FAIL: {resp.StatusCode} {json}");
                return;
            }

            using var doc = JsonDocument.Parse(json);
            _idToken = doc.RootElement.GetProperty("idToken").GetString();
            _refreshToken = doc.RootElement.TryGetProperty("refreshToken", out var rt) ? rt.GetString() : null;
            var expiresIn = doc.RootElement.GetProperty("expiresIn").GetString();
            _tokenExpiry = DateTime.UtcNow.AddSeconds(int.Parse(expiresIn ?? "3600") - 120);
            App.Log("FIREBASE_AUTH_OK (new session)");
        }
        catch (Exception ex)
        {
            App.Log($"FIREBASE_AUTH_ERROR: {ex.Message}");
        }
    }

    /// <summary>
    /// Refreshes the existing session using the saved refreshToken.
    /// Returns true on success, false on failure (caller should create a new session).
    /// </summary>
    private async Task<bool> RefreshTokenAsync()
    {
        try
        {
            var url = $"https://securetoken.googleapis.com/v1/token?key={ApiKey}";
            var body = new StringContent(
                $"grant_type=refresh_token&refresh_token={_refreshToken}",
                Encoding.UTF8, "application/x-www-form-urlencoded");
            var resp = await _http.PostAsync(url, body);
            if (!resp.IsSuccessStatusCode) return false;

            var json = await resp.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            _idToken = doc.RootElement.GetProperty("id_token").GetString();
            _refreshToken = doc.RootElement.TryGetProperty("refresh_token", out var rt) ? rt.GetString() : _refreshToken;
            var expiresIn = doc.RootElement.TryGetProperty("expires_in", out var ei) ? ei.GetString() : "3600";
            _tokenExpiry = DateTime.UtcNow.AddSeconds(int.Parse(expiresIn ?? "3600") - 120);
            App.Log("FIREBASE_AUTH_OK (refreshed)");
            return true;
        }
        catch (Exception ex)
        {
            App.Log($"FIREBASE_REFRESH_ERROR: {ex.Message}");
            return false;
        }
    }

    private async Task EnsureAuthAsync()
    {
        if (_idToken == null || DateTime.UtcNow >= _tokenExpiry)
            await AuthenticateAsync();
    }

    // ── Station Registration ──

    public async Task RegisterStationAsync(string stationId, string stationName)
    {
        await EnsureAuthAsync();
        var fields = new Dictionary<string, object>
        {
            ["name"] = StringField(stationName),
            ["status"] = StringField("locked"),
            ["online"] = BoolField(true),
            ["lastSeen"] = TimestampField(DateTime.UtcNow),
            ["createdAt"] = TimestampField(DateTime.UtcNow),
            ["command"] = StringField(""),
            ["timeRemaining"] = IntField(0),
        };

        await PatchAsync($"pcs/{stationId}", fields,
            "name", "status", "online", "lastSeen", "createdAt", "command", "timeRemaining");
        App.Log($"FIREBASE_REGISTERED: {stationId} ({stationName})");
    }

    // ── Heartbeat (called every 30s) ──

    public async Task SendHeartbeatAsync(string stationId, string status, int timeRemaining,
        int cpuPercent = 0, int ramPercent = 0, int diskPercent = 0,
        string? hostname = null, string? ipAddress = null)
    {
        await EnsureAuthAsync();
        var healthMap = new Dictionary<string, object>
        {
            ["mapValue"] = new Dictionary<string, object>
            {
                ["fields"] = new Dictionary<string, object>
                {
                    ["cpu"] = IntField(cpuPercent),
                    ["ram"] = IntField(ramPercent),
                    ["disk"] = IntField(diskPercent),
                }
            }
        };
        var fields = new Dictionary<string, object>
        {
            ["online"] = BoolField(true),
            ["lastSeen"] = TimestampField(DateTime.UtcNow),
            ["status"] = StringField(status),
            ["timeRemaining"] = IntField(timeRemaining),
            ["health"] = healthMap,
        };
        if (hostname != null) fields["hostname"] = StringField(hostname);
        if (ipAddress != null) fields["ipAddress"] = StringField(ipAddress);

        var mask = new List<string> { "online", "lastSeen", "status", "timeRemaining", "health" };
        if (hostname != null) mask.Add("hostname");
        if (ipAddress != null) mask.Add("ipAddress");

        await PatchAsync($"pcs/{stationId}", fields, mask.ToArray());
    }

    // ── Status Update (on lock/unlock) ──

    public async Task UpdateStatusAsync(string stationId, string status)
    {
        await EnsureAuthAsync();
        var fields = new Dictionary<string, object>
        {
            ["status"] = StringField(status),
            ["lastSeen"] = TimestampField(DateTime.UtcNow),
            ["online"] = BoolField(true),
        };

        await PatchAsync($"pcs/{stationId}", fields, "status", "lastSeen", "online");
        App.Log($"FIREBASE_STATUS: {stationId} → {status}");
    }

    // ── Go Offline ──

    public async Task GoOfflineAsync(string stationId)
    {
        await EnsureAuthAsync();
        var fields = new Dictionary<string, object>
        {
            ["online"] = BoolField(false),
            ["lastSeen"] = TimestampField(DateTime.UtcNow),
        };

        await PatchAsync($"pcs/{stationId}", fields, "online", "lastSeen");
    }

    // ── Poll for Commands ──

    public async Task<string?> PollCommandAsync(string stationId)
    {
        await EnsureAuthAsync();
        try
        {
            var url = $"{BaseUrl}/pcs/{stationId}";
            if (_idToken != null) url += $"?key={ApiKey}";

            var req = new HttpRequestMessage(HttpMethod.Get, url);
            if (_idToken != null) req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _idToken);

            var resp = await _http.SendAsync(req);
            if (!resp.IsSuccessStatusCode) return null;

            var json = await resp.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);

            if (!doc.RootElement.TryGetProperty("fields", out var fields)) return null;
            if (!fields.TryGetProperty("command", out var cmdField)) return null;
            if (!cmdField.TryGetProperty("stringValue", out var cmdVal)) return null;

            var cmd = cmdVal.GetString();
            return string.IsNullOrEmpty(cmd) ? null : cmd;
        }
        catch (Exception ex)
        {
            App.Log($"FIREBASE_POLL_ERROR: {ex.Message}");
            return null;
        }
    }

    // ── Read Station Info (player name, coins) ──

    public async Task<(string? playerName, int coinsRemaining)> GetStationInfoAsync(string stationId)
    {
        await EnsureAuthAsync();
        try
        {
            var url = $"{BaseUrl}/pcs/{stationId}?key={ApiKey}";
            var req = new HttpRequestMessage(HttpMethod.Get, url);
            if (_idToken != null) req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _idToken);

            var resp = await _http.SendAsync(req);
            if (!resp.IsSuccessStatusCode) return (null, 0);

            var json = await resp.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);

            if (!doc.RootElement.TryGetProperty("fields", out var fields)) return (null, 0);

            string? playerName = null;
            int coins = 0;

            if (fields.TryGetProperty("currentPlayerName", out var nameField) &&
                nameField.TryGetProperty("stringValue", out var nameVal))
                playerName = nameVal.GetString();

            if (fields.TryGetProperty("coinsRemaining", out var coinsField) &&
                coinsField.TryGetProperty("integerValue", out var coinsVal))
                coins = int.Parse(coinsVal.GetString() ?? "0");

            return (playerName, coins);
        }
        catch (Exception ex)
        {
            App.Log($"FIREBASE_STATIONINFO_ERROR: {ex.Message}");
            return (null, 0);
        }
    }

    // ── Clear Command after processing ──

    public async Task ClearCommandAsync(string stationId)
    {
        await EnsureAuthAsync();
        var fields = new Dictionary<string, object>
        {
            ["command"] = StringField(""),
        };
        await PatchAsync($"pcs/{stationId}", fields, "command");
    }

    // ── Player session history (writes to "sessions" collection) ──

    /// <summary>
    /// Creates a new session record for a player on a PC.
    /// Returns the new sessions/{id} doc id (used later to write endedAt + duration).
    /// </summary>
    public async Task<string?> StartPlayerSessionAsync(string stationId, string playerId, string playerName)
    {
        await EnsureAuthAsync();
        try
        {
            var sessionId = Guid.NewGuid().ToString("N");
            var fields = new Dictionary<string, object>
            {
                ["playerId"]   = StringField(playerId),
                ["playerName"] = StringField(playerName),
                ["pcId"]       = StringField(stationId),
                ["startedAt"]  = TimestampField(DateTime.UtcNow),
                ["endedAt"]    = new Dictionary<string, object> { ["nullValue"] = (object?)null! },
                ["durationSec"]= IntField(0),
                ["active"]     = BoolField(true),
            };
            // Use POST with documentId query param to control the doc id
            var url = $"{BaseUrl}/sessions?documentId={sessionId}&key={ApiKey}";
            var payload = JsonSerializer.Serialize(new { fields });
            var req = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json")
            };
            if (_idToken != null)
                req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _idToken);
            var resp = await _http.SendAsync(req);
            if (!resp.IsSuccessStatusCode)
            {
                var err = await resp.Content.ReadAsStringAsync();
                App.Log($"SESSION_START_PATCH_FAIL: {resp.StatusCode} {err}");
                return null;
            }
            App.Log($"SESSION_STARTED: {sessionId} player={playerName} pc={stationId}");
            return sessionId;
        }
        catch (Exception ex)
        {
            App.Log($"SESSION_START_ERROR: {ex.Message}");
            return null;
        }
    }

    /// <summary>Patches an existing sessions/{id} doc with endedAt + durationSec + active=false.</summary>
    public async Task EndPlayerSessionAsync(string sessionId, int durationSec)
    {
        await EnsureAuthAsync();
        var fields = new Dictionary<string, object>
        {
            ["endedAt"]     = TimestampField(DateTime.UtcNow),
            ["durationSec"] = IntField(durationSec),
            ["active"]      = BoolField(false),
        };
        await PatchAsync($"sessions/{sessionId}", fields, "endedAt", "durationSec", "active");
        App.Log($"SESSION_ENDED: {sessionId} duration={durationSec}s");
    }

    // ── Currently-sitting player on the PC card ──

    public async Task SetCurrentPlayerAsync(string stationId, string playerId, string playerName)
    {
        await EnsureAuthAsync();
        // Build a recent-player entry as a Firestore map value
        var recentEntry = new Dictionary<string, object>
        {
            ["mapValue"] = new Dictionary<string, object>
            {
                ["fields"] = new Dictionary<string, object>
                {
                    ["playerId"] = StringField(playerId),
                    ["playerName"] = StringField(playerName),
                    ["loginAt"] = TimestampField(DateTime.UtcNow),
                }
            }
        };

        // First read the current recentPlayers array, prepend the new entry, cap at 20
        var existingRecent = await GetRecentPlayersAsync(stationId);
        existingRecent.Insert(0, recentEntry);
        if (existingRecent.Count > 20) existingRecent = existingRecent.GetRange(0, 20);

        var fields = new Dictionary<string, object>
        {
            ["currentPlayerId"]   = StringField(playerId),
            ["currentPlayerName"] = StringField(playerName),
            ["sessionStartedAt"]  = TimestampField(DateTime.UtcNow),
            ["status"]            = StringField("occupied"),
            ["recentPlayers"]     = new Dictionary<string, object>
            {
                ["arrayValue"] = new Dictionary<string, object>
                {
                    ["values"] = existingRecent
                }
            },
        };
        await PatchAsync($"pcs/{stationId}", fields,
            "currentPlayerId", "currentPlayerName", "sessionStartedAt", "status", "recentPlayers");
    }

    /// <summary>Reads the current recentPlayers array from Firestore. Returns mutable list of map values.</summary>
    private async Task<List<object>> GetRecentPlayersAsync(string stationId)
    {
        try
        {
            await EnsureAuthAsync();
            var url = $"{BaseUrl}/pcs/{stationId}?key={ApiKey}&mask.fieldPaths=recentPlayers";
            var req = new HttpRequestMessage(HttpMethod.Get, url);
            if (_idToken != null)
                req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _idToken);
            var resp = await _http.SendAsync(req);
            if (!resp.IsSuccessStatusCode) return new List<object>();
            var json = await resp.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("fields", out var fields)) return new List<object>();
            if (!fields.TryGetProperty("recentPlayers", out var rpField)) return new List<object>();
            if (!rpField.TryGetProperty("arrayValue", out var arr)) return new List<object>();
            if (!arr.TryGetProperty("values", out var vals)) return new List<object>();

            // Convert each element back to a raw dictionary for re-serialization
            var result = new List<object>();
            foreach (var v in vals.EnumerateArray())
            {
                result.Add(JsonSerializer.Deserialize<object>(v.GetRawText())!);
            }
            return result;
        }
        catch (Exception ex)
        {
            App.Log($"GET_RECENT_PLAYERS_ERROR: {ex.Message}");
            return new List<object>();
        }
    }

    public async Task ClearCurrentPlayerAsync(string stationId)
    {
        await EnsureAuthAsync();
        var fields = new Dictionary<string, object>
        {
            ["currentPlayerId"]   = StringField(""),
            ["currentPlayerName"] = StringField(""),
            ["status"]            = StringField("locked"),
        };
        await PatchAsync($"pcs/{stationId}", fields, "currentPlayerId", "currentPlayerName", "status");
    }

    // ── Live screenshot upload ──

    /// <summary>
    /// Stores a base64-encoded JPEG screenshot on the pcs/{id} document at field
    /// "screenshot" (string) plus "screenshotAt" (timestamp). Admin panel polls
    /// this for a near-live view of each PC.
    /// </summary>
    public async Task UploadScreenshotAsync(string stationId, string base64Jpeg)
    {
        await EnsureAuthAsync();
        var fields = new Dictionary<string, object>
        {
            ["screenshot"]   = StringField(base64Jpeg),
            ["screenshotAt"] = TimestampField(DateTime.UtcNow),
        };
        await PatchAsync($"pcs/{stationId}", fields, "screenshot", "screenshotAt");
    }

    // ── Installed games (pushed by GameDiscovery on install / re-scan) ──

    public async Task UpdateInstalledGamesAsync(string stationId, IReadOnlyList<GameDiscovery.InstalledGame> games)
    {
        await EnsureAuthAsync();
        var gameValues = games.Select(g => new Dictionary<string, object>
        {
            ["mapValue"] = new Dictionary<string, object>
            {
                ["fields"] = new Dictionary<string, object>
                {
                    ["id"]      = StringField(g.Id),
                    ["name"]    = StringField(g.Name),
                    ["exePath"] = StringField(g.ExePath),
                    ["source"]  = StringField(g.Source),
                }
            }
        }).Cast<object>().ToList();

        var fields = new Dictionary<string, object>
        {
            ["installedGames"] = new Dictionary<string, object>
            {
                ["arrayValue"] = new Dictionary<string, object> { ["values"] = gameValues }
            },
            ["installedGamesScannedAt"] = TimestampField(DateTime.UtcNow),
            ["installedGamesCount"]     = IntField(games.Count),
        };
        await PatchAsync($"pcs/{stationId}", fields,
            "installedGames", "installedGamesScannedAt", "installedGamesCount");
        App.Log($"FIREBASE_INSTALLED_GAMES: {stationId} pushed {games.Count} entries");
    }

    // ── Command Response (admin exec/list-processes/system-info) ──

    public async Task UploadCommandResponseAsync(string stationId, string type, string data)
    {
        await EnsureAuthAsync();
        // Truncate to ~900KB to stay within Firestore 1MB doc limit
        if (data.Length > 900_000) data = data[..900_000] + "\n...[truncated]";
        var responseMap = new Dictionary<string, object>
        {
            ["mapValue"] = new Dictionary<string, object>
            {
                ["fields"] = new Dictionary<string, object>
                {
                    ["type"] = StringField(type),
                    ["data"] = StringField(data),
                    ["timestamp"] = TimestampField(DateTime.UtcNow),
                }
            }
        };
        var fields = new Dictionary<string, object>
        {
            ["commandResponse"] = responseMap,
        };
        await PatchAsync($"pcs/{stationId}", fields, "commandResponse");
    }

    // ── Player-initiated alerts (Inform Admin button on launch-failure popup)
    // Writes a new doc into the `pc-alerts` collection. Firestore auto-IDs the
    // doc. Admin panel listens to this collection and shows a popup.
    public async Task PostAlertAsync(Dictionary<string, object?> alert)
    {
        await EnsureAuthAsync();
        var fields = new Dictionary<string, object>();
        foreach (var kv in alert)
        {
            if (kv.Value is null) continue;
            fields[kv.Key] = kv.Value switch
            {
                bool b   => BoolField(b),
                int i    => IntField(i),
                long l   => new Dictionary<string, object> { ["integerValue"] = l.ToString() },
                double d => new Dictionary<string, object> { ["doubleValue"] = d },
                _        => StringField(kv.Value.ToString() ?? ""),
            };
        }
        // Always stamp a server-side timestamp so admin can sort by recency.
        fields["serverTime"] = TimestampField(DateTime.UtcNow);
        // Mark as unread so admin UI can highlight it.
        fields["acknowledged"] = BoolField(false);

        try
        {
            var url = $"{BaseUrl}/pc-alerts?key={ApiKey}";
            var payload = JsonSerializer.Serialize(new { fields });
            var req = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json")
            };
            if (_idToken != null)
                req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _idToken);
            var resp = await _http.SendAsync(req);
            if (!resp.IsSuccessStatusCode)
            {
                var err = await resp.Content.ReadAsStringAsync();
                App.Log($"FIREBASE_ALERT_FAIL: {resp.StatusCode} {err}");
            }
        }
        catch (Exception ex)
        {
            App.Log($"FIREBASE_ALERT_ERROR: {ex.Message}");
        }
    }

    // ── REST Helpers ──

    private async Task PatchAsync(string docPath, Dictionary<string, object> fields, params string[] updateMask)
    {
        try
        {
            var url = $"{BaseUrl}/{docPath}?key={ApiKey}";
            foreach (var f in updateMask)
                url += $"&updateMask.fieldPaths={f}";

            var payload = JsonSerializer.Serialize(new { fields });
            var req = new HttpRequestMessage(new HttpMethod("PATCH"), url)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json")
            };

            if (_idToken != null)
                req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _idToken);

            var resp = await _http.SendAsync(req);
            if (!resp.IsSuccessStatusCode)
            {
                var err = await resp.Content.ReadAsStringAsync();
                App.Log($"FIREBASE_PATCH_FAIL [{docPath}]: {resp.StatusCode} {err}");
            }
        }
        catch (Exception ex)
        {
            App.Log($"FIREBASE_PATCH_ERROR [{docPath}]: {ex.Message}");
        }
    }

    // ── Field Builders (Firestore REST format) ──

    private static Dictionary<string, object> StringField(string val) => new() { ["stringValue"] = val };
    private static Dictionary<string, object> BoolField(bool val) => new() { ["booleanValue"] = val };
    private static Dictionary<string, object> IntField(int val) => new() { ["integerValue"] = val.ToString() };
    private static Dictionary<string, object> TimestampField(DateTime val) => new() { ["timestampValue"] = val.ToString("yyyy-MM-ddTHH:mm:ss.fffZ") };

    public void Dispose() => _http.Dispose();
}
