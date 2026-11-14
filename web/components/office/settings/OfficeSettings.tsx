"use client";

import { Camera, DollarSign, Save, Shield, Upload, User } from "lucide-react";
import { OfficeSettingsProps } from "./helpers";
import { motion } from "framer-motion";
import { useOfficeSettings } from "./useOfficeSettings";
import { CompanyBrandingSection } from "./sections/CompanyBrandingSection";
import { ExpenseCategoriesSection } from "./sections/ExpenseCategoriesSection";
import { ClientPasswordManagementSection } from "./sections/ClientPasswordManagementSection";
import { OfficeInformationSection } from "./sections/OfficeInformationSection";
import { CategoryModal } from "./sections/CategoryModal";
import { DeleteModal } from "./sections/DeleteModal";
import { PasswordModal } from "./sections/PasswordModal";

export function OfficeSettings({
  userName,
  profileImage,
  onProfileImageChange,
}: OfficeSettingsProps) {
  const vm = useOfficeSettings({ userName, profileImage, onProfileImageChange });
  const { autoReconcile, currencyOk, defaultCurrency, emailNotifications, handleImageUpload, handleRemoveImage, handleSaveSettings, isSaving, setAutoReconcile, setDefaultCurrency, setEmailNotifications } = vm;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h2>
        <p className="text-sm text-slate-600 mt-1">
          Manage your office configuration, company branding, and client access
        </p>
      </div>

      {/* Company Branding Section */}
      <CompanyBrandingSection vm={vm} />

      {/* Profile Picture Section */}
      <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[#E9EEF6] flex items-center justify-center">
            <User className="w-5 h-5 text-[#0F172A]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Profile Picture
            </h3>
            <p className="text-sm text-slate-600">
              Upload your personal profile photo
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative group">
            {profileImage ? (
              <img
                src={profileImage}
                alt={userName}
                className="w-32 h-32 object-cover shadow-sm ring-4 ring-blue-500/30"
              />
            ) : (
              <div className="w-32 h-32 rounded-xl bg-[#0F172A] flex items-center justify-center text-white text-3xl font-semibold shadow-sm">
                {userName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-8 h-8 text-white" />
            </div>
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <p className="font-semibold text-slate-900 mb-1">{userName}</p>
              <p className="text-sm text-slate-600">Office Operator</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all rounded-lg">
                  <Upload className="w-4 h-4" />
                  <span>Upload New Photo</span>
                </div>
              </label>
              {profileImage && (
                <button
                  onClick={handleRemoveImage}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-100 hover:bg-red-200 text-red-700 font-medium transition-all"
                >
                  Remove Photo
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Recommended: Square image, at least 400x400px. Max file size: 5MB
            </p>
          </div>
        </div>
      </div>

      {/* Expense Category Management */}
      <ExpenseCategoriesSection vm={vm} />

      {/* Client Password Management */}
      <ClientPasswordManagementSection vm={vm} />

      {/* Office Information */}
      <OfficeInformationSection vm={vm} />

      {/* Currency Settings */}
      <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[#E9EEF6] flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-[#0F172A]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Currency Settings
            </h3>
            <p className="text-sm text-slate-600">
              Default currency and exchange preferences
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 uppercase mb-2">
              Default Currency
            </label>
            <select
              value={defaultCurrency}
              onChange={(e: any) => setDefaultCurrency(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
            >
              <option value="KES">KES - Kenyan Shilling</option>
              <option value="USD">USD - US Dollar</option>
              {currencyOk("UGX") && <option value="UGX">UGX - Ugandan Shilling</option>}
              <option value="EUR">EUR - Euro</option>
            </select>
          </div>
        </div>
      </div>

      {/* System Preferences */}
      <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[#E9EEF6] flex items-center justify-center">
            <Shield className="w-5 h-5 text-[#0F172A]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              System Preferences
            </h3>
            <p className="text-sm text-slate-600">
              Notification and automation settings
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50">
            <div>
              <p className="font-medium text-slate-900">Auto Reconciliation</p>
              <p className="text-sm text-slate-600">
                Automatically reconcile accounts daily
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={autoReconcile}
                onChange={(e: any) => setAutoReconcile(e.target.checked)}
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-50">
            <div>
              <p className="font-medium text-slate-900">Email Notifications</p>
              <p className="text-sm text-slate-600">
                Receive email alerts for important events
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={emailNotifications}
                onChange={(e: any) => setEmailNotifications(e.target.checked)}
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSaveSettings}
          disabled={isSaving}
          className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white font-semibold hover:bg-blue-700 rounded-lg transition-all disabled:opacity-50"
        >
          <Save className="w-5 h-5" />
          {isSaving ? "Saving..." : "Save All Settings"}
        </button>
      </div>

      {/* Expense Category Modal */}
      <CategoryModal vm={vm} />

      {/* Delete Category Confirmation Modal */}
      <DeleteModal vm={vm} />

      {/* Password Modal */}
      <PasswordModal vm={vm} />
    </motion.div>
  );
}
