"use client";

import { useAllowedCurrencies } from "@/lib/useBaseCurrency";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  DollarSign,
  Bell,
  Shield,
  Save,
  User,
  Camera,
  Upload,
  Building2,
  Key,
  Lock,
  Eye,
  EyeOff,
  Search,
  X,
  CheckCircle,
  XCircle,
  Image as ImageIcon,
  Trash2,
  Edit,
  RefreshCw,
  Plus,
  Tag,
  FolderOpen,
  AlertTriangle,
  Phone,
  Mail,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import {
  getClients,
  getExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
  resetClientPassword,
  getMyCompanyInfo,
  updateMyCompanySettings,
  ClientDto,
  ExpenseCategoryDto,
  allPages,
} from "@/lib/api";
import { loadCompanyBranding, saveCompanyBranding, shrinkImage } from "@/lib/companyBranding";

interface OfficeSettingsProps {
  userName: string;
  profileImage: string | null;
  onProfileImageChange: (imageUrl: string | null) => void;
}

export function OfficeSettings({
  userName,
  profileImage,
  onProfileImageChange,
}: OfficeSettingsProps) {
  // Kenyan bureaus don't use UGX; Ugandan ones use KES too (lib/useBaseCurrency).
  const { has: currencyOk } = useAllowedCurrencies();
  // Company Settings
  const [companyName, setCompanyName] = useState("");
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  // The logo is the bureau's (saved on the server, used on invoices). This upload used
  // to say "uploaded successfully" and keep it only until the page was reloaded.
  useEffect(() => {
    loadCompanyBranding().then((b) => setCompanyLogo(b.logo || null)).catch(() => {});
  }, []);
  const [officeName, setOfficeName] = useState("");
  const [officeEmail, setOfficeEmail] = useState("");
  const [officePhone, setOfficePhone] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("KES");
  const [autoReconcile, setAutoReconcile] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [companyLoading, setCompanyLoading] = useState(true);

  // Client Password Management
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientDto | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Expense Category Management
  const [expenseCategories, setExpenseCategories] = useState<
    ExpenseCategoryDto[]
  >([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<ExpenseCategoryDto | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categorySearchTerm, setCategorySearchTerm] = useState("");
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(
    null,
  );

  // Delete Category Confirmation Modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [categoryToDelete, setCategoryToDelete] =
    useState<ExpenseCategoryDto | null>(null);

  useEffect(() => {
    fetchCompanyInfo();
    fetchClients();
    fetchExpenseCategories();
  }, []);

  const fetchCompanyInfo = async () => {
    try {
      setCompanyLoading(true);
      const result = await getMyCompanyInfo();
      if (result.success && result.data) {
        setCompanyName(result.data.name || "");
        setOfficeName(result.data.name || "");
        setOfficeEmail(result.data.email || "");
        setOfficePhone(result.data.whatsAppNumber || "");
        setOfficeAddress(result.data.address || "");
      }
    } catch (error) {
      console.error("Error fetching company info:", error);
      toast.error("Failed to load data. Please refresh.");
    } finally {
      setCompanyLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      setLoading(true);
      const result = await allPages((p, n) => getClients(p, n));
      if (result.success && result.data?.items) {
        setClients(result.data.items);
      }
    } catch (error) {
      console.error("Error fetching clients:", error);
      toast.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  };

  const fetchExpenseCategories = async () => {
    try {
      setCategoryLoading(true);
      const result = await getExpenseCategories();
      if (result.success && result.data) {
        setExpenseCategories(result.data);
      }
    } catch (error) {
      console.error("Error fetching expense categories:", error);
      toast.error("Failed to load expense categories");
    } finally {
      setCategoryLoading(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!categoryName.trim()) {
      toast.error("Category name is required");
      return;
    }

    try {
      setCategoryLoading(true);
      const result = await createExpenseCategory({
        name: categoryName.trim(),
        description: categoryDescription.trim() || undefined,
      });

      if (result.success) {
        toast.success("Expense category created successfully!");
        setShowCategoryModal(false);
        setCategoryName("");
        setCategoryDescription("");
        fetchExpenseCategories();
      } else {
        toast.error(result.message || "Failed to create category");
      }
    } catch (error) {
      console.error("Error creating category:", error);
      toast.error("Failed to create expense category");
    } finally {
      setCategoryLoading(false);
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory || !categoryName.trim()) {
      toast.error("Category name is required");
      return;
    }

    try {
      setCategoryLoading(true);
      const result = await updateExpenseCategory(editingCategory.id, {
        name: categoryName.trim(),
        description: categoryDescription.trim() || undefined,
      });

      if (result.success) {
        toast.success("Expense category updated successfully!");
        setShowCategoryModal(false);
        setEditingCategory(null);
        setCategoryName("");
        setCategoryDescription("");
        fetchExpenseCategories();
      } else {
        toast.error(result.message || "Failed to update category");
      }
    } catch (error) {
      console.error("Error updating category:", error);
      toast.error("Failed to update expense category");
    } finally {
      setCategoryLoading(false);
    }
  };

  const openDeleteCategoryModal = (category: ExpenseCategoryDto) => {
    setCategoryToDelete(category);
    setShowDeleteModal(true);
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete) return;

    try {
      setDeletingCategoryId(categoryToDelete.id);
      const result = await deleteExpenseCategory(categoryToDelete.id);

      if (result.success) {
        toast.success("Expense category deleted successfully!");
        setShowDeleteModal(false);
        setCategoryToDelete(null);
        fetchExpenseCategories();
      } else {
        toast.error(result.message || "Failed to delete category");
      }
    } catch (error) {
      console.error("Error deleting category:", error);
      toast.error("Failed to delete expense category");
    } finally {
      setDeletingCategoryId(null);
    }
  };

  const openEditCategoryModal = (category: ExpenseCategoryDto) => {
    setEditingCategory(category);
    setCategoryName(category.name);
    setCategoryDescription(category.description || "");
    setShowCategoryModal(true);
  };

  const openNewCategoryModal = () => {
    setEditingCategory(null);
    setCategoryName("");
    setCategoryDescription("");
    setShowCategoryModal(true);
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const result = await updateMyCompanySettings({
        name: officeName.trim() || undefined,
        email: officeEmail.trim() || undefined,
        address: officeAddress.trim() || undefined,
      });

      if (result.success) {
        toast.success("Settings saved successfully!");
        // Refresh to confirm saved data
        await fetchCompanyInfo();
      } else {
        toast.error(result.message || "Failed to save settings");
      }
    } catch (error) {
      toast.error("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const imageUrl = reader.result as string;
        onProfileImageChange(imageUrl);
        toast.success("Profile picture updated successfully!");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const logo = await shrinkImage(file);
      const err = await saveCompanyBranding({ logo });
      if (err) { toast.error(err); return; }
      setCompanyLogo(logo);
      toast.success("Company logo saved — it will appear on your invoices.");
    } catch (e: any) {
      toast.error(e?.message || "That logo couldn't be used.");
    }
  };

  const handleRemoveImage = () => {
    onProfileImageChange(null);
    toast.success("Profile picture removed!");
  };

  const handleRemoveLogo = async () => {
    const err = await saveCompanyBranding({ logo: "" });
    if (err) { toast.error(err); return; }
    setCompanyLogo(null);
    toast.success("Company logo removed");
  };

  const handleSetPassword = (client: ClientDto) => {
    setSelectedClient(client);
    setNewPassword("");
    setConfirmPassword("");
    setShowPasswordModal(true);
  };

  const handlePasswordSubmit = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error("Please fill in all password fields");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters long");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (!selectedClient) {
      toast.error("No client selected");
      return;
    }

    try {
      setPasswordLoading(true);
      const result = await resetClientPassword(selectedClient.id, newPassword);

      if (result.success) {
        if (/could not be sent/i.test(result.message ?? "")) toast.warning(result.message, { duration: 10000 });
        else toast.success(`Password set successfully for ${getClientName(selectedClient)}`);
        setShowPasswordModal(false);
        setNewPassword("");
        setConfirmPassword("");
        setSelectedClient(null);
      } else {
        toast.error(result.message || "Failed to set password");
      }
    } catch (error) {
      console.error("Error setting password:", error);
      toast.error("Failed to set password");
    } finally {
      setPasswordLoading(false);
    }
  };

  const generateRandomPassword = () => {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(password);
    setConfirmPassword(password);
    toast.success("Random password generated!");
  };

  // Helper to get client display name
  const getClientName = (client: ClientDto) => client.fullName || "Unknown";

  const filteredClients = clients.filter((client) => {
    const name = getClientName(client).toLowerCase();
    const code = (client.code || "").toLowerCase();
    const phone = client.whatsAppNumber || "";
    const search = searchTerm.toLowerCase();
    return (
      name.includes(search) || code.includes(search) || phone.includes(search)
    );
  });

  const filteredCategories = expenseCategories.filter(
    (category) =>
      category.name.toLowerCase().includes(categorySearchTerm.toLowerCase()) ||
      (category.description
        ?.toLowerCase()
        .includes(categorySearchTerm.toLowerCase()) ??
        false),
  );

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
      <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#E9EEF6] flex items-center justify-center">
              <Tag className="w-5 h-5 text-[#0F172A]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Expense Categories
              </h3>
              <p className="text-sm text-slate-600">
                Manage categories for expense tracking
              </p>
            </div>
          </div>
          <button
            onClick={openNewCategoryModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold hover:bg-blue-700 rounded-lg transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Category
          </button>
        </div>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              value={categorySearchTerm}
              onChange={(e: any) => setCategorySearchTerm(e.target.value)}
              placeholder="Search categories..."
              className="w-full pl-10 pr-4 py-3 border border-slate-300 focus:border-blue-600 outline-none bg-white rounded-lg"
            />
          </div>
        </div>

        {categoryLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="text-center py-12 bg-white border border-slate-200 rounded-lg">
            <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 mb-2">No expense categories found</p>
            <p className="text-sm text-slate-500">
              Create categories to organize your expenses
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 overflow-hidden rounded-lg">
            <div className="overflow-x-auto max-w-full max-h-96">
              <table className="w-full">
                <thead className="bg-[#E9EEF6]">
                  <tr className="border-slate-200">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Category Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Description
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Status
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCategories.map((category) => (
                    <tr
                      key={category.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-[#E9EEF6] flex items-center justify-center">
                            <Tag className="w-4 h-4 text-[#0F172A]" />
                          </div>
                          <span className="text-sm font-semibold text-slate-900">
                            {category.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-600 line-clamp-2">
                          {category.description || "-"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {category.isActive ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700">
                            <CheckCircle className="w-3 h-3" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700">
                            <XCircle className="w-3 h-3" />
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEditCategoryModal(category)}
                            className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-700 transition-all"
                            title="Edit Category"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openDeleteCategoryModal(category)}
                            disabled={deletingCategoryId === category.id}
                            className="p-2 bg-red-100 hover:bg-red-200 text-red-700 transition-all disabled:opacity-50"
                            title="Delete Category"
                          >
                            {deletingCategoryId === category.id ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {expenseCategories.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="bg-white p-4 border border-slate-200 rounded-xl">
              <p className="text-xs font-semibold text-slate-600 uppercase mb-1">
                Total Categories
              </p>
              <p className="text-2xl font-semibold text-slate-900">
                {expenseCategories.length}
              </p>
            </div>
            <div className="bg-white p-4 border border-slate-200 rounded-xl">
              <p className="text-xs font-semibold text-slate-600 uppercase mb-1">
                Active Categories
              </p>
              <p className="text-2xl font-semibold text-emerald-600">
                {expenseCategories.filter((c) => c.isActive).length}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Client Password Management */}
      <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-emerald-600 flex items-center justify-center">
            <Key className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Client Password Management
            </h3>
            <p className="text-sm text-slate-600">
              Set or reset passwords for client portal access
            </p>
          </div>
        </div>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e: any) => setSearchTerm(e.target.value)}
              placeholder="Search clients by name, code, or phone..."
              className="w-full pl-10 pr-4 py-3 border border-emerald-200 focus:border-emerald-500 outline-none bg-white rounded-lg"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center py-12 bg-white border border-emerald-200 rounded-lg">
            <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600">No clients found</p>
          </div>
        ) : (
          <div className="bg-white border border-emerald-200 overflow-hidden rounded-lg">
            <div className="overflow-x-auto max-w-full max-h-96">
              <table className="w-full">
                <thead className="bg-[#E9EEF6]">
                  <tr className="border-emerald-200">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Code
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Balance (KES)
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Balance (USD)
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredClients.map((client) => (
                    <tr
                      key={client.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-mono text-slate-600">
                          {client.code || "-"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">
                        {getClientName(client)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                        {client.whatsAppNumber || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-emerald-700">
                        {(client.balanceKES ?? 0).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-blue-600">
                        {(client.balanceUSD ?? 0).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => handleSetPassword(client)}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white text-sm font-semibold hover:shadow-md transition-all"
                        >
                          <Lock className="w-4 h-4" />
                          Set Password
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Office Information */}
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
              </label>
              <input
                type="text"
                value={officeName}
                onChange={(e: any) => setOfficeName(e.target.value)}
                placeholder="Enter office name"
                className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
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
                </label>
                <input
                  type="tel"
                  value={officePhone}
                  onChange={(e: any) => setOfficePhone(e.target.value)}
                  placeholder="Enter phone number"
                  className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
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
      <AnimatePresence>
        {showCategoryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowCategoryModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="bg-[#0F172A] p-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 flex items-center justify-center">
                      <Tag className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold">
                        {editingCategory
                          ? "Edit Category"
                          : "New Expense Category"}
                      </h3>
                      <p className="text-sm text-slate-300">
                        {editingCategory
                          ? "Update category details"
                          : "Create a new expense category"}
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setShowCategoryModal(false)}
                    className="p-2 hover:bg-white/20 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 uppercase mb-2">
                    Category Name *
                  </label>
                  <input
                    type="text"
                    value={categoryName}
                    onChange={(e: any) => setCategoryName(e.target.value)}
                    placeholder="e.g., Office Supplies, Utilities, Transport"
                    className="w-full px-4 py-3 border border-slate-200 focus:border-blue-600 outline-none bg-white rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 uppercase mb-2">
                    Description (Optional)
                  </label>
                  <textarea
                    value={categoryDescription}
                    onChange={(e: any) =>
                      setCategoryDescription(e.target.value)
                    }
                    placeholder="Brief description of this expense category..."
                    rows={3}
                    className="w-full px-4 py-3 border border-slate-200 focus:border-blue-600 outline-none bg-white resize-none rounded-lg"
                  />
                </div>
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                  <p className="text-xs text-amber-800">
                    <strong>💡 Tip:</strong> Use clear, descriptive names for
                    your expense categories to make expense tracking easier.
                  </p>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={
                      editingCategory
                        ? handleUpdateCategory
                        : handleCreateCategory
                    }
                    disabled={categoryLoading || !categoryName.trim()}
                    className="flex-1 px-6 py-3 bg-blue-600 text-white font-semibold hover:bg-blue-700 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {categoryLoading ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <CheckCircle className="w-5 h-5" />
                    )}
                    {editingCategory ? "Update Category" : "Create Category"}
                  </button>
                  <button
                    onClick={() => setShowCategoryModal(false)}
                    className="flex-1 px-6 py-3 bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Category Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && categoryToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => {
              setShowDeleteModal(false);
              setCategoryToDelete(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white shadow-2xl max-w-md w-full overflow-hidden"
            >
              {/* Header */}
              <div className="bg-red-600 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 flex items-center justify-center">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold">Delete Category</h3>
                      <p className="text-sm text-white">
                        This action cannot be undone
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => {
                      setShowDeleteModal(false);
                      setCategoryToDelete(null);
                    }}
                    className="p-2 hover:bg-white/20 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-red-100 flex items-center justify-center flex-shrink-0">
                      <Tag className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 text-lg">
                        {categoryToDelete.name}
                      </p>
                      {categoryToDelete.description && (
                        <p className="text-sm text-slate-600 mt-1">
                          {categoryToDelete.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">
                        Warning
                      </p>
                      <p className="text-sm text-amber-700 mt-1">
                        Deleting this category will remove it permanently. Any
                        expenses associated with this category may need to be
                        reassigned.
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-center text-slate-600">
                  Are you sure you want to delete this expense category?
                </p>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleDeleteCategory}
                    disabled={deletingCategoryId === categoryToDelete.id}
                    className="flex-1 px-6 py-3 bg-red-600 text-white font-semibold hover:shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {deletingCategoryId === categoryToDelete.id ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <Trash2 className="w-5 h-5" />
                    )}
                    Yes, Delete Category
                  </button>
                  <button
                    onClick={() => {
                      setShowDeleteModal(false);
                      setCategoryToDelete(null);
                    }}
                    className="flex-1 px-6 py-3 bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Password Modal */}
      <AnimatePresence>
        {showPasswordModal && selectedClient && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowPasswordModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="bg-emerald-700 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 flex items-center justify-center">
                      <Lock className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold">Set Client Password</h3>
                      <p className="text-sm text-emerald-100">
                        {getClientName(selectedClient)}
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setShowPasswordModal(false)}
                    className="p-2 hover:bg-white/20 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
                  <p className="text-sm text-slate-700">
                    <strong>Client Code:</strong> {selectedClient.code || "-"}
                  </p>
                  <p className="text-sm text-slate-700">
                    <strong>Phone:</strong>{" "}
                    {selectedClient.whatsAppNumber || "-"}
                  </p>
                  <p className="text-sm text-slate-700">
                    <strong>Balance KES:</strong>{" "}
                    {(selectedClient.balanceKES ?? 0).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-sm text-slate-700">
                    <strong>Balance USD:</strong>{" "}
                    {(selectedClient.balanceUSD ?? 0).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 uppercase mb-2">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e: any) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full px-4 py-3 pr-10 border border-slate-200 focus:border-emerald-500 outline-none bg-white rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600"
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 uppercase mb-2">
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e: any) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full px-4 py-3 border border-slate-200 focus:border-emerald-500 outline-none bg-white rounded-lg"
                  />
                </div>
                <button
                  onClick={generateRandomPassword}
                  className="w-full px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Generate Random Password
                </button>
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                  <p className="text-xs text-amber-800">
                    <strong>⚠ Important:</strong> Make sure to share this
                    password securely with the client. They can change it after
                    their first login.
                  </p>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handlePasswordSubmit}
                    disabled={passwordLoading}
                    className="flex-1 px-6 py-3 bg-emerald-700 text-white font-semibold hover:shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {passwordLoading ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <CheckCircle className="w-5 h-5" />
                    )}
                    Set Password
                  </button>
                  <button
                    onClick={() => setShowPasswordModal(false)}
                    className="flex-1 px-6 py-3 bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
