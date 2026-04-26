using System;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;

namespace NinjaKiosk;

// Sets a DACL on the current process that denies PROCESS_TERMINATE
// to interactive users while keeping SYSTEM/Administrators full access.
// Effect: Task Manager "End task" returns Access Denied for normal users.
// Requires the process to be running with sufficient rights to call
// SetSecurityInfo on its own handle — normally true for the owning user.
internal static class ProcessProtection
{
    private const uint PROCESS_TERMINATE          = 0x00000001;
    private const uint PROCESS_VM_WRITE           = 0x00000020;
    private const uint PROCESS_VM_OPERATION       = 0x00000008;
    private const uint PROCESS_CREATE_THREAD      = 0x00000002;
    private const uint PROCESS_SUSPEND_RESUME     = 0x00000800;
    private const uint PROCESS_SET_INFORMATION    = 0x00000200;
    private const uint PROCESS_ALL_ACCESS         = 0x001FFFFF;

    private const int SE_KERNEL_OBJECT            = 6;
    private const int DACL_SECURITY_INFORMATION   = 0x00000004;
    private const uint PROTECTED_DACL_SECURITY_INFORMATION = 0x80000000;

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern uint SetSecurityInfo(
        IntPtr handle,
        int objectType,
        uint securityInfo,
        IntPtr pSidOwner,
        IntPtr pSidGroup,
        byte[] pDacl,
        IntPtr pSacl);

    public static bool Apply()
    {
        try
        {
            var sidEveryone = new SecurityIdentifier(WellKnownSidType.WorldSid, null);
            var sidUsers    = new SecurityIdentifier(WellKnownSidType.BuiltinUsersSid, null);
            var sidSystem   = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
            var sidAdmins   = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);

            // Rights to deny to non-admins: terminate + memory write + thread inject + suspend
            const uint denyMask = PROCESS_TERMINATE
                                | PROCESS_VM_WRITE
                                | PROCESS_VM_OPERATION
                                | PROCESS_CREATE_THREAD
                                | PROCESS_SUSPEND_RESUME
                                | PROCESS_SET_INFORMATION;

            var dacl = new RawAcl(2, 16);
            int idx = 0;
            // Order: deny ACEs MUST come before allow ACEs in a DACL.
            dacl.InsertAce(idx++, new CommonAce(AceFlags.None, AceQualifier.AccessDenied,
                (int)denyMask, sidEveryone, false, null));
            dacl.InsertAce(idx++, new CommonAce(AceFlags.None, AceQualifier.AccessDenied,
                (int)denyMask, sidUsers, false, null));
            // Keep elevated principals fully functional.
            dacl.InsertAce(idx++, new CommonAce(AceFlags.None, AceQualifier.AccessAllowed,
                (int)PROCESS_ALL_ACCESS, sidSystem, false, null));
            dacl.InsertAce(idx++, new CommonAce(AceFlags.None, AceQualifier.AccessAllowed,
                (int)PROCESS_ALL_ACCESS, sidAdmins, false, null));

            var daclBytes = new byte[dacl.BinaryLength];
            dacl.GetBinaryForm(daclBytes, 0);

            uint flags = (uint)DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION;
            uint rc = SetSecurityInfo(
                GetCurrentProcess(),
                SE_KERNEL_OBJECT,
                flags,
                IntPtr.Zero,
                IntPtr.Zero,
                daclBytes,
                IntPtr.Zero);

            return rc == 0;
        }
        catch
        {
            return false;
        }
    }
}
