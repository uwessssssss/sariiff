"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Building, CheckCircle, Hash, Image as ImageIcon, Mail, Phone, Save, Upload, X } from "lucide-react";
import { CompanyInfo } from "../helpers";
import { saveCompanyBranding } from "@/lib/companyBranding";
import { toast } from "sonner";
import { type InvoiceManagementVM } from "../useInvoiceManagement";

export function CompanySettingsPanel({ vm }: { vm: InvoiceManagementVM }) {
  const { companyInfo, handleLogoUpload, savingCompany, setCompanyInfo, setSavingCompany, setShowCompanySettings, showCompanySettings } = vm;
  return (
    <AnimatePresence>
      {showCompanySettings && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setShowCompanySettings(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e: any) => e.stopPropagation()}
            className="bg-white w-full max-w-3xl shadow-2xl border-4 border-blue-200"
          >
            <div className="bg-blue-600 p-8 border-b-4 border-blue-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-4 bg-white/20 border border-white/30 rounded-xl">
                    <Building className="w-10 h-10 text-white" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-semibold text-white">
                      Company Information
                    </h2>
                    <p className="text-blue-50 mt-1">
                      Configure your business details for invoices
                    </p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowCompanySettings(false)}
                  className="text-white hover:bg-white/20 p-3 transition-all border border-white/30 rounded-lg"
                >
                  <X className="w-7 h-7" />
                </motion.button>
              </div>
            </div>

            <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto bg-slate-50">
              {/* Logo Upload */}
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
                  Company Logo
                </label>
                <div className="flex items-center gap-6">
                  {companyInfo.logo ? (
                    <div className="w-40 h-40 border-4 border-blue-200 flex items-center justify-center overflow-hidden bg-white shadow-sm">
                      <img
                        src={companyInfo.logo}
                        alt="Logo"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-40 h-40 border-4 border-dashed border-slate-300 flex items-center justify-center bg-slate-50">
                      <ImageIcon className="w-16 h-16 text-slate-300" />
                    </div>
                  )}
                  <div className="flex-1 space-y-3">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="px-8 py-4 bg-blue-600 text-white transition-all font-semibold inline-flex items-center gap-3 shadow-sm hover:bg-blue-700"
                      >
                        <Upload className="w-5 h-5" />
                        Upload Logo
                      </motion.div>
                    </label>
                    <p className="text-sm text-slate-600">
                      <strong>Recommended:</strong> PNG or JPG, max 5MB
                      <br />
                      <strong>Size:</strong> 500x500px for best results
                    </p>
                  </div>
                </div>
              </div>

              {/* Company Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  {
                    label: "Company Name",
                    field: "name",
                    type: "text",
                    icon: Building,
                    readOnly: true, // set by the super admin
                  },
                  {
                    label: "Tax ID (KRA PIN / URA TIN)",
                    field: "taxId",
                    type: "text",
                    icon: Hash,
                  },
                  {
                    label: "Email Address",
                    field: "email",
                    type: "email",
                    icon: Mail,
                  },
                  {
                    label: "Phone Number",
                    field: "phone",
                    type: "tel",
                    icon: Phone,
                    readOnly: true, // the bureau's registered number
                  },
                  {
                    label: "Website",
                    field: "website",
                    type: "text",
                    icon: Building,
                  },
                  {
                    label: "Address",
                    field: "address",
                    type: "text",
                    icon: Building,
                  },
                ].map((field: { label: string; field: string; type: string; icon: any; readOnly?: boolean }) => (
                  <div key={field.field} className="space-y-2">
                    <label htmlFor={`co-${field.field}`} className="block text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                      <field.icon className="w-4 h-4" />
                      {field.label}
                      {field.readOnly && <span className="normal-case font-normal tracking-normal text-xs text-slate-500">from your account</span>}
                    </label>
                    <input
                      id={`co-${field.field}`}
                      type={field.type}
                      readOnly={field.readOnly}
                      aria-readonly={field.readOnly}
                      value={companyInfo[field.field as keyof CompanyInfo]}
                      onChange={(e: any) =>
                        setCompanyInfo({
                          ...companyInfo,
                          [field.field]: e.target.value,
                        })
                      }
                      className={`w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all font-medium text-lg rounded-lg ${field.readOnly ? "bg-slate-50 text-slate-500 cursor-not-allowed" : "text-slate-900"}`}
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-4 pt-6 border-t-4 border-slate-200">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowCompanySettings(false)}
                  className="flex-1 px-8 py-5 border border-slate-300 text-slate-700 hover:bg-slate-50 transition-all font-semibold text-lg rounded-lg"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={savingCompany}
                  onClick={async () => {
                    setSavingCompany(true);
                    const err = await saveCompanyBranding(companyInfo);
                    setSavingCompany(false);
                    if (err) { toast.error(err); return; }
                    setShowCompanySettings(false);
                    toast.success("Company details saved", { description: "They will appear on every invoice." });
                  }}
                  className="flex-1 px-8 py-5 bg-blue-600 text-white transition-all font-semibold text-lg flex items-center justify-center gap-3 shadow-sm hover:bg-blue-700"
                >
                  <Save className="w-6 h-6" />
                  Save Changes
                  <CheckCircle className="w-6 h-6" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
