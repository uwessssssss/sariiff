using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SARIFF.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class WalletCurrency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Currency",
                table: "MpesaAgents",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Currency",
                table: "MpesaAgents");
        }
    }
}
