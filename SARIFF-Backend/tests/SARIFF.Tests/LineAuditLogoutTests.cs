using SARIFF.Core.Enums;
using Xunit;

namespace SARIFF.Tests;

/// <summary>Line-by-line audit, Auth (sign-out): LO1.</summary>
public class LineAuditLogoutTests
{
    // LO1
    [Fact]
    public async Task Signing_out_on_one_office_device_leaves_the_others_signed_in()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var counterTablet = await w.OfficeSignInOnTrustedDeviceAsync();
        var backOffice = await w.OfficeSignInOnTrustedDeviceAsync();

        // The apps sign out on their own after a few idle minutes (3 on the phone). Sign-out
        // ended EVERY session of the bureau, so an idle counter tablet logged the back office
        // out in the middle of its work.
        var r = await w.Auth.LogoutAsync(w.Co.Id, UserRole.OfficeUser, counterTablet.RefreshToken);
        Assert.True(r.Success);

        Assert.False(await w.CanRefreshAsync(counterTablet), "the device that signed out is still signed in");
        Assert.True(await w.CanRefreshAsync(backOffice), "signing out one device signed out the other");
    }
}
