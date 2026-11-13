"use client";

import { Building2, Mail, MapPin, Phone, RefreshCw, Settings } from "lucide-react";
import { type OfficeSettingsVM } from "../useOfficeSettings";

export function OfficeInformationSection({ vm }: { vm: OfficeSettingsVM }) {
  const { companyLoading, officeAddress, officeEmail, officeName, officePhone, setOfficeAddress, setOfficeEmail } = vm;
  return (
    <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-[#E9EEF6] flex items-center justify-center">
          <Settings className="w-5 h-5 text-[#0F172A]" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Office Information
          </h3>
          <p className="text-sm text-slate-600">
            Basic office details and contact information
          </p>
        </div>
        {companyLoading && (
          <RefreshCw className="w-5 h-5 text-blue-600 animate-spin ml-auto" />
        )}
      </div>

      {companyLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-sm text-slate-600">
              Loading office information...
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 uppercase mb-2">
              <Building2 className="w-4 h-4 inline mr-2" />
              Office Name
              <span className="ml-2 normal-case font-normal text-xs text-slate-500">set by the system administrator</span>
            </label>
            {/* Read-only, like Company Branding and the invoice settings say: Save
                used to send this name, and the phone below was never sent at all. */}
            <input
              type="text"
              value={officeName}
              readOnly
              aria-readonly
              className="w-full px-4 py-3 border border-slate-200 outline-none bg-slate-50 text-slate-500 cursor-not-allowed rounded-lg"
            />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 uppercase mb-2">
                <Mail className="w-4 h-4 inline mr-2" />
                Email Address
              </label>
              <input
                type="email"
                value={officeEmail}
                onChange={(e: any) => setOfficeEmail(e.target.value)}
                placeholder="Enter email address"
                className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 uppercase mb-2">
                <Phone className="w-4 h-4 inline mr-2" />
                Phone Number
                <span className="ml-2 normal-case font-normal text-xs text-slate-500">registered number</span>
              </label>
              <input
                type="tel"
                value={officePhone}
                readOnly
                aria-readonly
                className="w-full px-4 py-3 border border-slate-200 outline-none bg-slate-50 text-slate-500 cursor-not-allowed rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 uppercase mb-2">
              <MapPin className="w-4 h-4 inline mr-2" />
              Office Address
            </label>
            <input
              type="text"
              value={officeAddress}
              onChange={(e: any) => setOfficeAddress(e.target.value)}
              placeholder="Enter office address"
              className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}
