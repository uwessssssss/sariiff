
using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

/// <summary>
/// Transaction Service - Implements TRADITIONAL DOUBLE-ENTRY ACCOUNTING
/// 
/// ACCOUNTING RULES:
/// ┌─────────────────┬────────────────────┬────────────────────┐
/// │ Account Type    │ DEBIT              │ CREDIT             │
/// ├─────────────────┼────────────────────┼────────────────────┤
/// │ ASSET           │ Balance INCREASES  │ Balance DECREASES  │
/// │ (Cash/Bank/     │ (money comes IN)   │ (money goes OUT)   │
/// │  M-Pesa)        │                    │                    │
/// ├─────────────────┼────────────────────┼────────────────────┤
/// │ LIABILITY       │ Balance DECREASES  │ Balance INCREASES  │
/// │ (Client)        │ (we owe less)      │ (we owe more)      │
/// └─────────────────┴────────────────────┴────────────────────┘
/// 
/// DOUBLE-ENTRY: Every transaction affects two accounts with equal and opposite effects.
/// 
/// REVERSAL METHOD: When deleting a transaction, we create a reversal entry
/// (opposite transaction) to maintain audit trail and running balance integrity.
/// Split into TransactionService.Create / .Queries / .Delete / .Summary / .Balances.
/// </summary>
public partial class TransactionService : ITransactionService
{
    private readonly AppDbContext _context;
    private readonly INotificationService _notificationService;
    private readonly IClientAlertHelper _alertHelper;
    private readonly ISystemLogService _systemLog;
    private readonly IBalanceAlertService _balanceAlertService;

    public TransactionService(
        AppDbContext context, 
        INotificationService notificationService,
        ISystemLogService systemLog,
        IClientAlertHelper alertHelper,
        IBalanceAlertService balanceAlertService)
    {
        _context = context;
        _notificationService = notificationService;
        _systemLog = systemLog;
        _alertHelper = alertHelper;
        _balanceAlertService = balanceAlertService;
    }
}
