"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { Loader2, Save, KeyRound, User } from "lucide-react";
import { toast } from "sonner";

export default function ProfilePage() {
  const { data: session, update: updateSession } = useSession();
  const [loading, setLoading] = useState(true);
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [originalEmail, setOriginalEmail] = useState("");
  const [infoPassword, setInfoPassword] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    axios
      .get("/api/profile")
      .then((r) => {
        setName(r.data.name);
        setEmail(r.data.email);
        setOriginalEmail(r.data.email);
      })
      .catch(() => toast.error("Failed to load profile"))
      .finally(() => setLoading(false));
  }, []);

  const emailChanged = email !== originalEmail;

  async function handleSaveInfo() {
    if (!name || !email) return toast.error("Name and email are required");
    if (emailChanged && !infoPassword) {
      return toast.error("Current password is required to change email");
    }
    setSavingInfo(true);
    try {
      const payload: Record<string, string> = { name, email };
      if (emailChanged) payload.currentPassword = infoPassword;
      const res = await axios.patch("/api/profile", payload);
      setOriginalEmail(res.data.email);
      setInfoPassword("");
      await updateSession({ name: res.data.name, email: res.data.email });
      toast.success("Profile updated");
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error ?? "Failed" : "Failed";
      toast.error(msg);
    } finally {
      setSavingInfo(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      return toast.error("All password fields are required");
    }
    if (newPassword !== confirmPassword) return toast.error("New passwords do not match");
    if (newPassword.length < 6) return toast.error("New password must be at least 6 characters");
    setSavingPassword(true);
    try {
      await axios.patch("/api/profile", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed");
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error ?? "Failed" : "Failed";
      toast.error(msg);
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-green-500" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-lg mx-auto space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-white">My Profile</h1>
          <p className="text-xs text-gray-500 mt-0.5">Update your name, email, and password</p>
        </div>

        {/* Account details */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
            <User className="w-4 h-4" />
            Account Details
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Full Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Role</label>
            <input
              disabled
              value={session?.user?.role?.toLowerCase() ?? ""}
              className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-sm text-gray-500 cursor-not-allowed capitalize"
            />
          </div>
          {emailChanged && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Current Password <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                value={infoPassword}
                onChange={(e) => setInfoPassword(e.target.value)}
                placeholder="Required to change email"
                className="w-full px-3 py-2 bg-gray-800 border border-amber-700/50 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          )}
          <button
            onClick={handleSaveInfo}
            disabled={savingInfo}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-800 text-white text-sm font-medium rounded-lg transition"
          >
            {savingInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>

        {/* Change password */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
            <KeyRound className="w-4 h-4" />
            Change Password
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <button
            onClick={handleChangePassword}
            disabled={savingPassword}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-800 text-white text-sm font-medium rounded-lg transition"
          >
            {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Change Password
          </button>
        </div>
      </div>
    </div>
  );
}
