using Microsoft.AspNetCore.Mvc.Filters;

namespace SARIFF.API.Middleware;

/// <summary>
/// Keeps ?page= and ?pageSize= sane on EVERY endpoint: page is at least 1, pageSize 1–1000.
///
/// Before (Nov 2026) only 3 of 17 paged endpoints checked them: page=0 reached the database
/// as a negative OFFSET (a 500 error) and pageSize=1000000 asked for a whole table at once.
/// </summary>
public sealed class PagingClampFilter : IActionFilter
{
    public const int MaxPageSize = 1000;

    public void OnActionExecuting(ActionExecutingContext context)
    {
        var args = context.ActionArguments;
        if (args.TryGetValue("page", out var p) && p is int page && page < 1) args["page"] = 1;
        if (args.TryGetValue("pageSize", out var s) && s is int size) args["pageSize"] = Math.Clamp(size, 1, MaxPageSize);
    }

    public void OnActionExecuted(ActionExecutedContext context) { }
}
