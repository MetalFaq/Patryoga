"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useState } from "react";

export function SignOutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  return (
    <button
      aria-label="Cerrar sesión"
      className="icon-button"
      disabled={isSigningOut}
      onClick={() => {
        setIsSigningOut(true);
        void signOut({ redirectTo: "/login" });
      }}
      title="Cerrar sesión"
      type="button"
    >
      {isSigningOut
        ? <LoaderCircle aria-hidden="true" className="animate-spin" size={20} />
        : <LogOut aria-hidden="true" size={20} />}
    </button>
  );
}
