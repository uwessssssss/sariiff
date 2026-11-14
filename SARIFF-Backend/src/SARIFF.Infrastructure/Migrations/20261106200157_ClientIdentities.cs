using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SARIFF.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ClientIdentities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Companies_WhatsAppNumber",
                table: "Companies");

            migrationBuilder.AddColumn<Guid>(
                name: "ClientIdentityId",
                table: "UserSessions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ClientIdentityId",
                table: "Users",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "IdentityLinkedAt",
                table: "Users",
                type: "timestamp without time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PinFailedAttempts",
                table: "Companies",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "PinFailuresSince",
                table: "Companies",
                type: "timestamp without time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ClientIdentities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PhoneNumber = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    PhoneVerifiedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    LastLoginAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    FailedOtpAttempts = table.Column<int>(type: "integer", nullable: false),
                    LockedUntil = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClientIdentities", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PinGrants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PinGrants", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ClientIdentityDevices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientIdentityId = table.Column<Guid>(type: "uuid", nullable: false),
                    DeviceIdHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    DeviceName = table.Column<string>(type: "text", nullable: true),
                    TrustedUntil = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    LastUsedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClientIdentityDevices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ClientIdentityDevices_ClientIdentities_ClientIdentityId",
                        column: x => x.ClientIdentityId,
                        principalTable: "ClientIdentities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Users_ClientIdentityId_CompanyId",
                table: "Users",
                columns: new[] { "ClientIdentityId", "CompanyId" },
                unique: true,
                filter: "\"ClientIdentityId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Companies_WhatsAppNumber",
                table: "Companies",
                column: "WhatsAppNumber",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_ClientIdentities_PhoneNumber",
                table: "ClientIdentities",
                column: "PhoneNumber",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_ClientIdentityDevices_ClientIdentityId_DeviceIdHash",
                table: "ClientIdentityDevices",
                columns: new[] { "ClientIdentityId", "DeviceIdHash" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PinGrants_CompanyId_UserId",
                table: "PinGrants",
                columns: new[] { "CompanyId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PinGrants_ExpiresAt",
                table: "PinGrants",
                column: "ExpiresAt");

            migrationBuilder.AddForeignKey(
                name: "FK_Users_ClientIdentities_ClientIdentityId",
                table: "Users",
                column: "ClientIdentityId",
                principalTable: "ClientIdentities",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Users_ClientIdentities_ClientIdentityId",
                table: "Users");

            migrationBuilder.DropTable(
                name: "ClientIdentityDevices");

            migrationBuilder.DropTable(
                name: "PinGrants");

            migrationBuilder.DropTable(
                name: "ClientIdentities");

            migrationBuilder.DropIndex(
                name: "IX_Users_ClientIdentityId_CompanyId",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Companies_WhatsAppNumber",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "ClientIdentityId",
                table: "UserSessions");

            migrationBuilder.DropColumn(
                name: "ClientIdentityId",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "IdentityLinkedAt",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "PinFailedAttempts",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "PinFailuresSince",
                table: "Companies");

            migrationBuilder.CreateIndex(
                name: "IX_Companies_WhatsAppNumber",
                table: "Companies",
                column: "WhatsAppNumber",
                unique: true);
        }
    }
}
