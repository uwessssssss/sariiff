"use client";



export interface OfficeSettingsProps {
  userName: string;
  profileImage: string | null;
  onProfileImageChange: (imageUrl: string | null) => void;
}
