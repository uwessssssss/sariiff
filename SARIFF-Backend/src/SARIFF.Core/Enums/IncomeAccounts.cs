namespace SARIFF.Core.Enums;

/// <summary>
/// The bureau's income accounts and its withholding-tax account. They are fixed, the same
/// for every bureau, and keep no stored balance: a total is the sum of the postings to it
/// (each posting carries its CompanyId). Fixed ids mean no new table and no migration.
///
/// Double entry, as posted:
///  - Commission paid by the network, gross G, tax withheld W:
///      Dr wallet/bank/cash  G − W      Cr Commission income  G − W
///      Dr Withholding tax   W          Cr Commission income  W
///    so commission income = G (gross) and the tax is a credit the bureau claims back.
///  - A fee charged to a client:   Dr client (balance down)   Cr Fee income
///  - A network charge the bureau pays is an EXPENSE (Dr expense, Cr wallet), not here.
/// </summary>
public static class IncomeAccounts
{
    public static readonly Guid Commission = new("5a1f0000-0000-4000-8000-000000000001");
    public static readonly Guid Fees = new("5a1f0000-0000-4000-8000-000000000002");
    public static readonly Guid Other = new("5a1f0000-0000-4000-8000-000000000003");
    public static readonly Guid WithholdingTax = new("5a1f0000-0000-4000-8000-000000000010");

    public static readonly IReadOnlyList<(Guid Id, string Name)> Income = new[]
    {
        (Commission, "Mobile money commission"),
        (Fees, "Fee income"),
        (Other, "Other income"),
    };

    public static bool IsIncome(Guid id) => id == Commission || id == Fees || id == Other;

    /// <summary>Whether this (type, id) is one of the fixed accounts.</summary>
    public static bool Known(AccountType type, Guid id) => type switch
    {
        AccountType.Income => IsIncome(id),
        AccountType.TaxRecoverable => id == WithholdingTax,
        _ => false,
    };

    public static string Name(AccountType type, Guid id) => type switch
    {
        AccountType.Income => Income.FirstOrDefault(i => i.Id == id).Name ?? "Income",
        AccountType.TaxRecoverable => "Withholding tax recoverable",
        _ => "Account",
    };
}
