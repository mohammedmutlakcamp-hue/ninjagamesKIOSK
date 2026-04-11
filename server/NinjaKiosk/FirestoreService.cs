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
    private DateTime _tokenExpiry = DateTime.MinValue;

    // ── Auth (anonymous sign-in to satisfy Firestore rules) ──

    public async Task AuthenticateAsync()
    {
        try
        {
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
            var expiresIn = doc.RootElement.GetProperty("expiresIn").GetString();
            _tokenExpiry = DateTime.UtcNow.AddSeconds(int.Parse(expiresIn ?? "3600") - 60);
            App.Log("FIREBASE_AUTH_OK");
        }
        catch (Exception ex)
        {
            App.Log($"FIREBASE_AUTH_ERROR: {ex.Message}");
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

    public async Task SendHeartbeatAsync(string stationId, string status, int timeRemaining)
    {
        await EnsureAuthAsync();
        var fields = new Dictionary<string, object>
        {
            ["online"] = BoolField(true),
            ["lastSeen"] = TimestampField(DateTime.UtcNow),
            ["status"] = StringField(status),
            ["timeRemaining"] = IntField(timeRemaining),
        };

        await PatchAsync($"pcs/{stationId}", fields,
            "online", "lastSeen", "status", "timeRemaining");
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
