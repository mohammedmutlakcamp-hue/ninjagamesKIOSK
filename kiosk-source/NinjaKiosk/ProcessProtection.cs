using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;

namespace NinjaKiosk;

// Hardens the running process so Task Manager / `taskkill` / `Stop-Process`
// cannot terminate it from the user session. Only SYSTEM (or our own
// ghanemexit code path, which calls Application.Shutdown directly inside
// the process — no external TerminateProcess needed) can stop the kiosk.
//
// Mechanism:
//   - SetSecurityInfo on the current process handle, replacing the DACL
//     with one that explicitly DENIES PROCESS_TERMINATE + PROCESS_SUSPEND_RESUME
//     + PROCESS_VM_WRITE + PROCESS_CREATE_THREAD to Authenticated Users,
//     and grants minimal observation rights (PROCESS_QUERY_LIMITED_INFORMATION)
//     to Everyone so taskbar/perfcounter UIs still show us.
//
// This survives process elevation: even an Administrator hitting "End Task"
// in Task Manager gets ERROR_ACCESS_DENIED. SYSTEM bypasses ACLs but
// requires psexec -s or similar — out of reach for end users.
internal static class ProcessProtection
{
    // PROCESS_* access mask bits we care about
    private const uint PROCESS_TERMINATE              = 0x0001;
    private const uint PROCESS_CREATE_THREAD          = 0x0002;
    private const uint PROCESS_VM_WRITE               = 0x0020;
    private const uint PROCESS_SUSPEND_RESUME         = 0x0800;
    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    private const uint PROCESS_QUERY_INFORMATION      = 0x0400;
    private const uint READ_CONTROL                   = 0x00020000;
    private const uint SYNCHRONIZE                    = 0x00100000;

    // SetSecurityInfo flags
    private const uint DACL_SECURITY_INFORMATION      = 0x00000004;
    private const uint UNPROTECTED_DACL_SECURITY_INFORMATION = 0x20000000;
    // SE_KERNEL_OBJECT
    private const int  SE_KERNEL_OBJECT = 6;

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern uint SetSecurityInfo(
        IntPtr handle, int objectType, uint securityInfo,
        IntPtr psidOwner, IntPtr psidGroup, IntPtr pDacl, IntPtr pSacl);

    /// <summary>
    /// Apply the deny-terminate DACL to this process.
    /// Returns true on success. Logs failures via App.Log.
    /// </summary>
    public static bool ApplyAntiKill()
    {
        try
        {
            var dacl = new RawAcl(2, 0);

            // Authenticated Users SID (S-1-5-11) — covers every interactive user
            var authUsers = new SecurityIdentifier(WellKnownSidType.AuthenticatedUserSid, null);
            // Everyone SID (S-1-1-0) — for the read-only allow ACE
            var everyone  = new SecurityIdentifier(WellKnownSidType.WorldSid, null);

            // 1. DENY everyone interactive the dangerous rights.
            //    Listed first so Windows evaluates DENY before any inherited ALLOW.
            uint denyMask = PROCESS_TERMINATE
                          | PROCESS_CREATE_THREAD
                          | PROCESS_VM_WRITE
                          | PROCESS_SUSPEND_RESUME;
            var denyAce = new CommonAce(
                AceFlags.None, AceQualifier.AccessDenied, (int)denyMask,
                authUsers, isCallback: false, opaque: null);
            dacl.InsertAce(0, denyAce);

            // 2. ALLOW everyone harmless query rights so Task Manager etc still
            //    enumerates the process (otherwise it disappears from listings,
            //    which looks suspicious).
            uint allowMask = PROCESS_QUERY_LIMITED_INFORMATION
                           | PROCESS_QUERY_INFORMATION
                           | READ_CONTROL
                           | SYNCHRONIZE;
            var allowAce = new CommonAce(
                AceFlags.None, AceQualifier.AccessAllowed, (int)allowMask,
                everyone, isCallback: false, opaque: null);
            dacl.InsertAce(1, allowAce);

            // Marshal DACL into a native byte buffer for SetSecurityInfo
            var raw = new byte[dacl.BinaryLength];
            dacl.GetBinaryForm(raw, 0);

            var pDacl = Marshal.AllocHGlobal(raw.Length);
            try
            {
                Marshal.Copy(raw, 0, pDacl, raw.Length);

                uint err = SetSecurityInfo(
                    GetCurrentProcess(),
                    SE_KERNEL_OBJECT,
                    DACL_SECURITY_INFORMATION | UNPROTECTED_DACL_SECURITY_INFORMATION,
                    IntPtr.Zero, IntPtr.Zero,
                    pDacl, IntPtr.Zero);

                if (err != 0)
                {
                    App.Log($"PROCESS_PROTECT_FAIL: SetSecurityInfo win32={err}");
                    return false;
                }
            }
            finally
            {
                Marshal.FreeHGlobal(pDacl);
            }

            App.Log("PROCESS_PROTECT_OK: Task Manager kill denied for non-SYSTEM users");
            return true;
        }
        catch (Exception ex)
        {
            App.Log($"PROCESS_PROTECT_EX: {ex.Message}");
            return false;
        }
    }
}
