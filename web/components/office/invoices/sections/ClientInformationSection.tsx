"use client";

import { User } from "lucide-react";
import { type InvoiceManagementVM } from "../useInvoiceManagement";

export function ClientInformationSection({ vm }: { vm: InvoiceManagementVM }) {
  const { formData, samples, setFormData, showCreateModal } = vm;
  if (!(showCreateModal)) return null;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 bg-blue-600 flex items-center justify-center">
          <User className="w-6 h-6 text-white" />
        </div>
        <h3 className="text-2xl font-semibold text-slate-800">
          Client Information
        </h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Client Name *
          </label>
          <input
            type="text"
            value={formData.clientName}
            onChange={(e: any) =>
              setFormData({
                ...formData,
                clientName: e.target.value,
              })
            }
            className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-medium text-lg rounded-lg"
            placeholder="John Doe Enterprises"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Email Address *
          </label>
          <input
            type="email"
            value={formData.clientEmail}
            onChange={(e: any) =>
              setFormData({
                ...formData,
                clientEmail: e.target.value,
              })
            }
            className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-medium text-lg rounded-lg"
            placeholder="client@company.com"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Phone Number
          </label>
          <input
            type="tel"
            value={formData.clientPhone}
            onChange={(e: any) =>
              setFormData({
                ...formData,
                clientPhone: e.target.value,
              })
            }
            className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-medium text-lg rounded-lg"
            placeholder={samples.phone}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Address
          </label>
          <input
            type="text"
            value={formData.clientAddress}
            onChange={(e: any) =>
              setFormData({
                ...formData,
                clientAddress: e.target.value,
              })
            }
            className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-medium text-lg rounded-lg"
            placeholder={samples.place}
          />
        </div>
      </div>
    </div>
  );
}
