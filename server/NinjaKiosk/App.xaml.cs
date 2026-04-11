using System.IO;
using System.Threading;
using System.Windows;

namespace NinjaKiosk;

public partial class App : Application
{
    private static readonly string LogFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "ninja-games-kiosk", "crash.log");

    private Mutex? _mutex;

    protected override void OnStartup(StartupEventArgs e)
    {
        // Single-instance guard — prevent duplicate kiosk windows
        _mutex = new Mutex(true, "NinjaKiosk_SingleInstance", out bool isNew);
        if (!isNew)
        {
            Log("BLOCKED: another instance is already running");
            Shutdown();
            return;
        }
        // Log ALL crashes
        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
        {
            Log($"UNHANDLED: {args.ExceptionObject}");
        };

        DispatcherUnhandledException += (_, args) =>
        {
            Log($"DISPATCHER: {args.Exception}");
            args.Handled = true; // Don't crash
        };

        TaskScheduler.UnobservedTaskException += (_, args) =>
        {
            Log($"TASK: {args.Exception}");
            args.SetObserved(); // Don't crash
        };

        base.OnStartup(e);

        // Check for command line args from installer
        var cmdArgs = Environment.GetCommandLineArgs();
        string? cliPcName = null;
        string? cliServerIp = null;
        for (int i = 1; i < cmdArgs.Length; i++)
        {
            if (cmdArgs[i].StartsWith("--pc-name=", StringComparison.OrdinalIgnoreCase))
                cliPcName = cmdArgs[i].Substring("--pc-name=".Length).Trim();
            else if (cmdArgs[i].StartsWith("--server-ip=", StringComparison.OrdinalIgnoreCase))
                cliServerIp = cmdArgs[i].Substring("--server-ip=".Length).Trim();
        }

        // If installer passed a PC name, save config and skip setup dialog
        if (!string.IsNullOrEmpty(cliPcName) && !SetupWindow.HasConfig())
        {
            var id = System.Text.RegularExpressions.Regex.Replace(cliPcName.ToLower(), @"[^a-z0-9\-]", "-");
            id = System.Text.RegularExpressions.Regex.Replace(id, @"-+", "-").Trim('-');
            SetupWindow.SaveConfig(id, cliPcName);
            Log($"CONFIG_FROM_INSTALLER: {id} ({cliPcName})");
        }

        // If installer passed a server IP, save LAN config
        if (!string.IsNullOrEmpty(cliServerIp))
        {
            MainWindow.SaveLanServerIp(cliServerIp);
            Log($"LAN_SERVER_FROM_INSTALLER: {cliServerIp}");
        }

        // Show setup dialog if no config exists
        if (!SetupWindow.HasConfig())
        {
            Log("NO_CONFIG — showing setup");
            var setup = new SetupWindow();
            if (setup.ShowDialog() != true)
            {
                Log("SETUP_CANCELLED — exiting");
                Shutdown();
                return;
            }
        }

        // Launch main kiosk window
        var main = new MainWindow();
        main.Show();
    }

    public static void Log(string msg)
    {
        try
        {
            var dir = Path.GetDirectoryName(LogFile)!;
            Directory.CreateDirectory(dir);
            File.AppendAllText(LogFile, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {msg}\n");
        }
        catch { }
    }
}
