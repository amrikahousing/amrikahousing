"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";

type ProfileFormProps = {
  initialProfile: {
    userId: string;
    email: string;
    phoneNumber: string;
    city: string;
    state: string;
    zipCode: string;
    twoFactorEnabled: boolean;
    twoFactorMethod: "email" | "phone" | "";
  };
};

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 disabled:bg-slate-100 disabled:text-slate-500";

export function ProfileForm({ initialProfile }: ProfileFormProps) {
  const { user } = useUser();
  const [email] = useState(initialProfile.email);
  const [phoneNumber, setPhoneNumber] = useState(initialProfile.phoneNumber);
  const [city, setCity] = useState(initialProfile.city);
  const [state, setState] = useState(initialProfile.state);
  const [zipCode, setZipCode] = useState(initialProfile.zipCode);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(
    initialProfile.twoFactorEnabled,
  );
  const [twoFactorMethod, setTwoFactorMethod] = useState<"email" | "phone" | "">(
    initialProfile.twoFactorMethod,
  );
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!twoFactorEnabled) {
      setTwoFactorMethod("");
    }
  }, [twoFactorEnabled]);

  async function saveProfile() {
    if (!user) return;

    if (twoFactorEnabled && !twoFactorMethod) {
      setStatus("Choose email or phone before enabling 2FA.");
      return;
    }

    if (twoFactorEnabled && twoFactorMethod === "phone" && !phoneNumber.trim()) {
      setStatus("Add a phone number to use phone-based 2FA.");
      return;
    }

    setIsSaving(true);
    setStatus(null);

    try {
      await user.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          phoneNumber: phoneNumber.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          zipCode: zipCode.trim() || null,
          mfaEnabled: twoFactorEnabled,
          twoFactorMethod:
            twoFactorEnabled && twoFactorMethod ? twoFactorMethod : null,
        },
      });
      setStatus("Profile saved.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Failed to save profile. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-200 p-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 21a7.5 7.5 0 0 1 15 0" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            Contact Information
          </h2>
        </div>

        <div className="space-y-4 p-6">
          <Field id="profile-user-id" label="User ID">
            <input
              id="profile-user-id"
              className={inputClass}
              value={initialProfile.userId}
              readOnly
              disabled
            />
          </Field>

          <Field id="profile-email" label="Email address">
            <input
              id="profile-email"
              type="email"
              className={inputClass}
              value={email}
              readOnly
              disabled
            />
          </Field>

          <Field id="profile-phone" label="Phone number">
            <input
              id="profile-phone"
              className={inputClass}
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="+1 (555) 123-4567"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="profile-city" label="City">
              <input
                id="profile-city"
                className={inputClass}
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Atlanta"
              />
            </Field>
            <Field id="profile-state" label="State">
              <input
                id="profile-state"
                className={inputClass}
                value={state}
                onChange={(event) => setState(event.target.value.toUpperCase())}
                placeholder="GA"
                maxLength={2}
              />
            </Field>
            <Field id="profile-zip" label="Zip code">
              <input
                id="profile-zip"
                className={inputClass}
                value={zipCode}
                onChange={(event) => setZipCode(event.target.value)}
                placeholder="30303"
              />
            </Field>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              onClick={saveProfile}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save changes"}
            </button>
            {status ? <p className="text-sm text-slate-500">{status}</p> : null}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-200 p-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3.5 19 6v5.5c0 4.2-2.7 7.3-7 9-4.3-1.7-7-4.8-7-9V6l7-2.5Z" />
              <path d="m9.5 12 1.7 1.7 3.8-4" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            Two-Factor Authentication (2FA)
          </h2>
        </div>

        <div className="space-y-4 p-6">
          <fieldset className="space-y-3">
            <legend className="sr-only">Two-factor authentication status</legend>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="two-factor-status"
                checked={!twoFactorEnabled}
                onChange={() => setTwoFactorEnabled(false)}
              />
              Disabled
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="two-factor-status"
                checked={twoFactorEnabled}
                onChange={() => setTwoFactorEnabled(true)}
              />
              Enabled
            </label>
          </fieldset>

          {twoFactorEnabled ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm text-slate-600">
                Choose your two-factor verification method.
              </p>
              <fieldset className="space-y-3">
                <legend className="sr-only">Two-factor method</legend>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="two-factor-method"
                    value="email"
                    checked={twoFactorMethod === "email"}
                    onChange={() => setTwoFactorMethod("email")}
                  />
                  Email
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="two-factor-method"
                    value="phone"
                    checked={twoFactorMethod === "phone"}
                    onChange={() => setTwoFactorMethod("phone")}
                  />
                  Phone
                </label>
              </fieldset>
              {twoFactorMethod === "phone" ? (
                <p className="text-xs text-slate-500">
                  Phone 2FA uses the phone number in your contact information.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
