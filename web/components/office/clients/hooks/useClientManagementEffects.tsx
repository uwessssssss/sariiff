"use client";

import autoTable from "jspdf-autotable";
import { getClientTypeLabel, getCompanyCurrencies, getStoredAuth } from "@/lib/api";
import jsPDF from "jspdf";
import { localDate } from "@/lib/dates";
import { toast } from "sonner";
import { useEffect } from "react";
import { type useClientManagementState } from "./useClientManagementState";

/** ClientManagement: effects (part 2 of 2 of useClientManagement). */
export function useClientManagementEffects(prev: ReturnType<typeof useClientManagementState>) {
  const { activeTab, clientStats, clients, fetchClientStats, fetchClients, searchTerm, setActiveCurrencies, setCurrentPage, totalCount } = prev;
  const handleExportClientsPDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Get company info from auth
      const auth = getStoredAuth();
      const companyName = auth?.user?.companyName || "Money Exchange";

      // ========== CORPORATE HEADER ==========
      // Top accent line
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, pageWidth, 4, "F");

      // Company branding area
      doc.setFillColor(250, 250, 250);
      doc.rect(0, 4, pageWidth, 36, "F");

      // Logo placeholder
      doc.setFillColor(37, 99, 235);
      doc.rect(14, 10, 24, 24, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(companyName.charAt(0).toUpperCase(), 26, 26, {
        align: "center",
      });

      // Company name and document title
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(companyName, 44, 18);

      doc.setTextColor(107, 114, 128);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("Client Portfolio Report", 44, 26);

      // Right side - Document info
      doc.setTextColor(107, 114, 128);
      doc.setFontSize(8);
      doc.text("Report Date", pageWidth - 14, 14, { align: "right" });
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(
        new Date().toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
        pageWidth - 14,
        21,
        { align: "right" },
      );

      doc.setTextColor(107, 114, 128);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("Total Clients", pageWidth - 14, 28, { align: "right" });
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(String(totalCount), pageWidth - 14, 35, { align: "right" });

      // Separator line
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      doc.line(14, 42, pageWidth - 14, 42);

      // ========== PORTFOLIO SUMMARY ==========
      let yPos = 50;

      if (clientStats) {
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("PORTFOLIO SUMMARY", 14, yPos);

        yPos += 6;
        const cardWidth = (pageWidth - 42) / 4;

        // Total Clients
        doc.setDrawColor(229, 231, 235);
        doc.rect(14, yPos, cardWidth, 20, "S");
        doc.setFontSize(7);
        doc.setTextColor(107, 114, 128);
        doc.setFont("helvetica", "normal");
        doc.text("Total Clients", 16, yPos + 6);
        doc.setFontSize(12);
        doc.setTextColor(17, 24, 39);
        doc.setFont("helvetica", "bold");
        doc.text(String(clientStats.totalClients ?? 0), 16, yPos + 14);

        // Permanent
        doc.rect(14 + cardWidth + 4, yPos, cardWidth, 20, "S");
        doc.setFontSize(7);
        doc.setTextColor(107, 114, 128);
        doc.setFont("helvetica", "normal");
        doc.text("Permanent", 18 + cardWidth, yPos + 6);
        doc.setFontSize(12);
        doc.setTextColor(22, 163, 74);
        doc.setFont("helvetica", "bold");
        doc.text(
          String(clientStats.permanentClients ?? 0),
          18 + cardWidth,
          yPos + 14,
        );

        // KES Balance
        const kesBal = clientStats.totalBalanceKES ?? 0;
        const kesPositive = kesBal >= 0;
        doc.rect(14 + (cardWidth + 4) * 2, yPos, cardWidth, 20, "S");
        doc.setFontSize(7);
        doc.setTextColor(107, 114, 128);
        doc.setFont("helvetica", "normal");
        doc.text("KES Portfolio", 18 + (cardWidth + 4) * 2, yPos + 6);
        doc.setFontSize(10);
        doc.setTextColor(
          kesPositive ? 22 : 185,
          kesPositive ? 163 : 28,
          kesPositive ? 74 : 28,
        );
        doc.setFont("helvetica", "bold");
        doc.text(
          `${kesPositive ? "" : "-"}${Math.abs(kesBal).toLocaleString()}`,
          18 + (cardWidth + 4) * 2,
          yPos + 14,
        );

        // USD Balance
        const usdBal = clientStats.totalBalanceUSD ?? 0;
        const usdPositive = usdBal >= 0;
        doc.rect(14 + (cardWidth + 4) * 3, yPos, cardWidth, 20, "S");
        doc.setFontSize(7);
        doc.setTextColor(107, 114, 128);
        doc.setFont("helvetica", "normal");
        doc.text("USD Portfolio", 18 + (cardWidth + 4) * 3, yPos + 6);
        doc.setFontSize(10);
        doc.setTextColor(
          usdPositive ? 22 : 185,
          usdPositive ? 163 : 28,
          usdPositive ? 74 : 28,
        );
        doc.setFont("helvetica", "bold");
        doc.text(
          `${usdPositive ? "" : "-"}${Math.abs(usdBal).toLocaleString()}`,
          18 + (cardWidth + 4) * 3,
          yPos + 14,
        );

        yPos += 28;
      }

      // ========== CLIENT LIST ==========
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("CLIENT DIRECTORY", 14, yPos);

      const tableData = clients.map((client) => {
        const kesBalance = client.balanceKES ?? 0;
        const usdBalance = client.balanceUSD ?? 0;
        const kesPos = kesBalance >= 0;
        const usdPos = usdBalance >= 0;
        return [
          client.code || "-",
          client.fullName || "Unknown",
          getClientTypeLabel(client.clientType),
          client.whatsAppNumber || "-",
          `${kesPos ? "" : "-"}KES ${Math.abs(kesBalance).toLocaleString()}`,
          `${usdPos ? "" : "-"}USD ${Math.abs(usdBalance).toLocaleString()}`,
          (client.otherBalances || [])
            .filter((b: any) => (b.balance ?? 0) !== 0)
            .map((b: any) => `${b.currencyCode} ${(b.balance ?? 0).toLocaleString()}`)
            .join(", ") || "-",
          client.isActive ? "Active" : "Inactive",
        ];
      });

      autoTable(doc, {
        startY: yPos + 4,
        head: [
          [
            "Code",
            "Client Name",
            "Type",
            "Phone",
            "KES Balance",
            "USD Balance",
            "Other Balances",
            "Status",
          ],
        ],
        body: tableData,
        theme: "plain",
        styles: {
          fontSize: 8,
          cellPadding: 3,
        },
        headStyles: {
          fillColor: [249, 250, 251],
          textColor: [75, 85, 99],
          fontStyle: "bold",
          lineWidth: 0.1,
          lineColor: [229, 231, 235],
        },
        bodyStyles: {
          lineWidth: 0.1,
          lineColor: [243, 244, 246],
        },
        columnStyles: {
          0: { cellWidth: 18 },
          1: { cellWidth: 34 },
          2: { cellWidth: 20 },
          3: { cellWidth: 26 },
          4: { cellWidth: 26, halign: "right" },
          5: { cellWidth: 24, halign: "right" },
          6: { cellWidth: 24, halign: "right" },
          7: { cellWidth: 14, halign: "center" },
        },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        margin: { left: 14, right: 14 },
        didParseCell: (data: any) => {
          // KES (4) and USD (5) balance columns: red if negative, green otherwise
          if (
            data.section === "body" &&
            (data.column.index === 4 || data.column.index === 5)
          ) {
            const cellVal = String(data.cell.raw || "");
            const isNegative = cellVal.startsWith("-");
            data.cell.styles.textColor = isNegative
              ? [185, 28, 28]
              : [22, 163, 74];
          }
          // Other balances (6): violet tint
          if (data.section === "body" && data.column.index === 6) {
            data.cell.styles.textColor = [124, 58, 237];
          }
          // Status (7)
          if (data.section === "body" && data.column.index === 7) {
            data.cell.styles.textColor =
              data.cell.raw === "Active" ? [22, 163, 74] : [156, 163, 175];
          }
        },
        didDrawPage: (data: any) => {
          // Footer
          doc.setDrawColor(229, 231, 235);
          doc.line(14, pageHeight - 20, pageWidth - 14, pageHeight - 20);

          doc.setFontSize(7);
          doc.setTextColor(156, 163, 175);
          doc.text(companyName, 14, pageHeight - 12);
          doc.text(`Page ${data.pageNumber}`, pageWidth / 2, pageHeight - 12, {
            align: "center",
          });
          doc.text("Confidential", pageWidth - 14, pageHeight - 12, {
            align: "right",
          });
        },
      });

      const fileName = `${companyName.replace(/\s+/g, "_")}_Clients_Report_${
        localDate()
      }.pdf`;
      doc.save(fileName);
      toast.success("Client report exported successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF report");
    }
  };
  // ==============================================
  // Computed Values
  // ==============================================

  const stats = clientStats || {
    totalClients: 0,
    permanentClients: 0,
    temporaryClients: 0,
    clientsWithDebit: 0,
    clientsWithCredit: 0,
    totalBalanceKES: 0,
    totalBalanceUSD: 0,
    byCurrency: null,
  };
  // ==============================================
  // Effects
  // ==============================================

  useEffect(() => {
    fetchClients();
    fetchClientStats();
    // Load the company's actually-used currencies for column visibility.
    getCompanyCurrencies()
      .then((res) => {
        if (res.success && res.data?.currencies?.length) {
          setActiveCurrencies(res.data.currencies.map((c) => c.value));
        }
      })
      .catch(() => {
        /* keep the KES/USD default on failure */
      });
  }, [fetchClients, fetchClientStats]);
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm]);

  return {
    handleExportClientsPDF,
    stats,
  };
}
