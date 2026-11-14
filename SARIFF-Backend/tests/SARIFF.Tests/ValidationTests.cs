using SARIFF.Infrastructure.Services;
using Xunit;

namespace SARIFF.Tests;

/// <summary>Every input rule the money screens rely on.</summary>
public class ValidationTests
{
    [Theory]
    [InlineData("0.01", true)]
    [InlineData("999999999.99", true)]
    [InlineData("1000000000", false)]
    [InlineData("0", false)]
    [InlineData("-1", false)]
    [InlineData("10.5", true)]
    [InlineData("10.555", false)]
    public void Amounts_are_positive_to_the_cent_and_under_a_billion(string amount, bool ok) =>
        Assert.Equal(ok, ValidationHelper.ValidateAmount(decimal.Parse(amount, System.Globalization.CultureInfo.InvariantCulture)).IsValid);

    [Fact]
    public void An_opening_balance_may_be_zero_but_not_negative()
    {
        Assert.True(ValidationHelper.ValidateAmount(0, "Opening balance", allowZero: true).IsValid);
        var (ok, error) = ValidationHelper.ValidateAmount(-1, "Opening balance", allowZero: true);
        Assert.False(ok);
        Assert.Equal("Opening balance must be zero or positive", error);
    }

    [Theory]
    [InlineData("129.5", true)]
    [InlineData("0.000001", true)]
    [InlineData("0", false)]
    [InlineData("1000000", false)]
    public void Rates_are_positive_and_sane(string rate, bool ok) =>
        Assert.Equal(ok, ValidationHelper.ValidateRate(decimal.Parse(rate, System.Globalization.CultureInfo.InvariantCulture)).IsValid);

    [Theory]
    [InlineData("+254712345678", true)]
    [InlineData("+256772009900", true)]
    [InlineData("0712345678", false)]
    [InlineData("+2547", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void Phone_numbers_are_international(string? phone, bool ok) =>
        Assert.Equal(ok, ValidationHelper.ValidatePhone(phone).IsValid);

    [Theory]
    [InlineData(null, true)]
    [InlineData("amina@example.co.ke", true)]
    [InlineData("not-an-email", false)]
    public void Email_is_optional_but_well_formed(string? email, bool ok) =>
        Assert.Equal(ok, ValidationHelper.ValidateEmail(email).IsValid);

    [Fact]
    public void An_overlong_email_is_refused() =>
        Assert.False(ValidationHelper.ValidateEmail(new string('a', 250) + "@x.com").IsValid);

    [Theory]
    [InlineData("Amina Wanjiru", true)]
    [InlineData("O'Brien-Smith Jr.", true)]
    [InlineData("Zoë Ñúñez", true)]
    [InlineData("A", false)]
    [InlineData("R2D2", false)]
    [InlineData("  ", false)]
    public void Names_are_letters_spaces_and_punctuation(string name, bool ok) =>
        Assert.Equal(ok, ValidationHelper.ValidateName(name).IsValid);

    [Fact]
    public void An_overlong_name_is_refused() =>
        Assert.Contains("too long", ValidationHelper.ValidateName(new string('a', 256)).Error);

    [Theory]
    [InlineData("Test@123", true)]
    [InlineData("short", false)]
    [InlineData("", false)]
    public void Passwords_need_eight_characters(string pw, bool ok) =>
        Assert.Equal(ok, ValidationHelper.ValidatePassword(pw).IsValid);

    [Fact]
    public void An_overlong_password_is_refused() =>
        Assert.False(ValidationHelper.ValidatePassword(new string('x', 129)).IsValid);

    [Fact]
    public void Free_text_is_optional_limited_and_script_free()
    {
        Assert.True(ValidationHelper.ValidateText(null, "Notes").IsValid);
        Assert.False(ValidationHelper.ValidateText(null, "Notes", required: true).IsValid);
        Assert.False(ValidationHelper.ValidateText(new string('x', 11), "Notes", maxLength: 10).IsValid);
        Assert.False(ValidationHelper.ValidateText("click javascript:alert(1)", "Notes").IsValid);
        Assert.True(ValidationHelper.ValidateText("Paid at counter 2", "Notes").IsValid);
    }

    [Theory]
    [InlineData("0011223344", true)]
    [InlineData("ACC-2026", true)]
    [InlineData("12", false)]
    [InlineData("12 34 56", false)]
    [InlineData(null, false)]
    public void Account_numbers_are_4_to_30_letters_digits_or_dashes(string? number, bool ok) =>
        Assert.Equal(ok, ValidationHelper.ValidateAccountNumber(number).IsValid);

    [Fact]
    public void The_first_failing_rule_is_reported()
    {
        Assert.Null(ValidationHelper.FirstError(ValidationHelper.ValidateName("Amina"), ValidationHelper.ValidateAmount(5)));
        Assert.Equal("Amount must be greater than zero",
            ValidationHelper.FirstError(ValidationHelper.ValidateName("Amina"), ValidationHelper.ValidateAmount(0), ValidationHelper.ValidatePhone("x")));
    }
}
