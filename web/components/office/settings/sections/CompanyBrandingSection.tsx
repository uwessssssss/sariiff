"use client";

import { Building2, Image as ImageIcon, RefreshCw, Trash2, Upload } from "lucide-react";
import { type OfficeSettingsVM } from "../useOfficeSettings";

export function CompanyBrandingSection({ vm }: { vm: OfficeSettingsVM }) {
  const { companyLoading, companyLogo, companyName, handleLogoUpload, handleRemoveLogo, setCompanyName } = vm;
  return (
    <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-[#E9EEF6] flex items-center justify-center">
          <Building2 className="w-5 h-5 text-[#0F172A]" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Company Branding
          </h3>
          <p className="text-sm text-slate-600">
            Customize your company name and logo
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {companyLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
            <span className="ml-2 text-slate-600">
              Loading company info...
            </span>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-semibold text-slate-700 uppercase mb-2">
                Company Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={companyName}
                  onChange={(e: any) => setCompanyName(e.target.value)}
                  placeholder="Enter your company name"
                  className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
                  readOnly
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <span className="text-xs text-blue-600 bg-[#E9EEF6] px-2 py-1 rounded">
                    From System
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Company name is managed by the system administrator
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 uppercase mb-2">
                Company Logo
              </label>
              {companyLogo ? (
                <div className="flex items-start gap-6">
                  <div className="relative group">
                    <img
                      src={companyLogo}
                      alt="Company Logo"
                      className="w-40 h-40 object-contain bg-white p-4 border border-slate-200 shadow-sm rounded-xl"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="bg-white p-4 border border-slate-200 rounded-xl">
                      <p className="text-sm font-medium text-slate-900 mb-1">
                        Logo uploaded successfully!
                      </p>
                      <p className="text-xs text-slate-600">
                        This logo will appear on all your invoices and
                        documents
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                        <div className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all rounded-lg">
                          <Upload className="w-4 h-4" />
                          Replace Logo
                        </div>
                      </label>
                      <button
                        onClick={handleRemoveLogo}
                        className="flex items-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-semibold transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-slate-200 p-8 text-center bg-white rounded-xl">
                  <ImageIcon className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                  <p className="text-slate-600 mb-4">No logo uploaded yet</p>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <div className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold hover:bg-blue-700 rounded-lg transition-all">
                      <Upload className="w-5 h-5" />
                      Upload Company Logo
                    </div>
                  </label>
                  <p className="text-xs text-slate-500 mt-3">
                    Recommended: PNG or JPG, transparent background, 400x400px
                    minimum. Max 5MB
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
