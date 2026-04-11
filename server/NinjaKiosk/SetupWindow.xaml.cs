using System.IO;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Windows;

namespace NinjaKiosk;

public partial class SetupWindow : Window
{
    private static readonly string ConfigDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "ninja-games-kiosk");

    private static readonly string ConfigFile = Path.Combine(ConfigDir, "pc-config.json");

    public string? StationId { get; private set; }
    public string? StationName { get; private set; }

    public SetupWindow()
    {
        InitializeComponent();
        TxtPcName.TextChanged += (_, _) => UpdateStationId();

        // Pre-fill from installer argument if available
        var args = Environment.GetCommandLineArgs();
        for (int i = 1; i < args.Length; i++)
        {
            if (args[i].StartsWith("--pc-name=", StringComparison.OrdinalIgnoreCase))
            {
                TxtPcName.Text = args[i].Substring("--pc-name=".Length);
                break;
            }
        }
    }

    private void UpdateStationId()
    {
        var name = TxtPcName.Text.Trim();
        var id = Regex.Replace(name.ToLower(), @"[^a-z0-9\-]", "-");
        id = Regex.Replace(id, @"-+", "-").Trim('-');
        if (string.IsNullOrEmpty(id)) id = "pc-01";
        TxtStationId.Text = id;
    }

    private async void BtnSave_Click(object sender, RoutedEventArgs e)
    {
        var name = TxtPcName.Text.Trim();
        if (string.IsNullOrEmpty(name))
        {
            TxtError.Text = "Please enter a PC name.";
            return;
        }

        var id = TxtStationId.Text;

        BtnSave.IsEnabled = false;
        BtnSave.Content = "Registering...";
        TxtError.Text = "";

        try
        {
            // Register in Firebase
            using var firebase = new FirestoreService();
            await firebase.AuthenticateAsync();
            await firebase.RegisterStationAsync(id, name);

            // Save locally
            SaveConfig(id, name);

            StationId = id;
            StationName = name;
            DialogResult = true;
            Close();
        }
        catch (Exception ex)
        {
            TxtError.Text = $"Registration failed: {ex.Message}";
            App.Log($"SETUP_ERROR: {ex}");
            BtnSave.IsEnabled = true;
            BtnSave.Content = "Register & Start Kiosk";
        }
    }

    // ── Config persistence ──

    public static void SaveConfig(string stationId, string stationName)
    {
        Directory.CreateDirectory(ConfigDir);
        var config = new { stationId, stationName };
        File.WriteAllText(ConfigFile, JsonSerializer.Serialize(config));
        App.Log($"CONFIG_SAVED: {stationId} ({stationName})");
    }

    public static (string? stationId, string? stationName) LoadConfig()
    {
        try
        {
            if (!File.Exists(ConfigFile)) return (null, null);
            var json = File.ReadAllText(ConfigFile);
            using var doc = JsonDocument.Parse(json);
            var id = doc.RootElement.GetProperty("stationId").GetString();
            var name = doc.RootElement.GetProperty("stationName").GetString();
            return (id, name);
        }
        catch
        {
            return (null, null);
        }
    }

    public static bool HasConfig() => File.Exists(ConfigFile);

    public static void ClearConfig()
    {
        try { if (File.Exists(ConfigFile)) File.Delete(ConfigFile); } catch { }
    }
}
