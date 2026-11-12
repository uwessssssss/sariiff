"use client";

import { ClientDto, ExpenseCategoryDto, allPages, createExpenseCategory, deleteExpenseCategory, getClients, getExpenseCategories, getMyCompanyInfo, resetClientPassword, updateExpenseCategory, updateMyCompanySettings } from "@/lib/api";
import { OfficeSettingsProps } from "./helpers";
import { loadCompanyBranding, saveCompanyBranding, shrinkImage } from "@/lib/companyBranding";
import { toast } from "sonner";
import { useAllowedCurrencies } from "@/lib/useBaseCurrency";
import { useEffect, useState } from "react";

/** All of OfficeSettings's state, effects and handlers. The screen and its sections read them from here. */
export function useOfficeSettings({
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

  return {
    userName,
    profileImage,
    onProfileImageChange,
    currencyOk,
    companyName,
    setCompanyName,
    companyLogo,
    setCompanyLogo,
    officeName,
    setOfficeName,
    officeEmail,
    setOfficeEmail,
    officePhone,
    setOfficePhone,
    officeAddress,
    setOfficeAddress,
    defaultCurrency,
    setDefaultCurrency,
    autoReconcile,
    setAutoReconcile,
    emailNotifications,
    setEmailNotifications,
    companyLoading,
    setCompanyLoading,
    clients,
    setClients,
    selectedClient,
    setSelectedClient,
    showPasswordModal,
    setShowPasswordModal,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    showPassword,
    setShowPassword,
    searchTerm,
    setSearchTerm,
    loading,
    setLoading,
    passwordLoading,
    setPasswordLoading,
    expenseCategories,
    setExpenseCategories,
    showCategoryModal,
    setShowCategoryModal,
    editingCategory,
    setEditingCategory,
    categoryName,
    setCategoryName,
    categoryDescription,
    setCategoryDescription,
    categoryLoading,
    setCategoryLoading,
    categorySearchTerm,
    setCategorySearchTerm,
    deletingCategoryId,
    setDeletingCategoryId,
    showDeleteModal,
    setShowDeleteModal,
    categoryToDelete,
    setCategoryToDelete,
    fetchCompanyInfo,
    fetchClients,
    fetchExpenseCategories,
    handleCreateCategory,
    handleUpdateCategory,
    openDeleteCategoryModal,
    handleDeleteCategory,
    openEditCategoryModal,
    openNewCategoryModal,
    isSaving,
    setIsSaving,
    handleSaveSettings,
    handleImageUpload,
    handleLogoUpload,
    handleRemoveImage,
    handleRemoveLogo,
    handleSetPassword,
    handlePasswordSubmit,
    generateRandomPassword,
    getClientName,
    filteredClients,
    filteredCategories,
  };
}

export type OfficeSettingsVM = ReturnType<typeof useOfficeSettings>;
