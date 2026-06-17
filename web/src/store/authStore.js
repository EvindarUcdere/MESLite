import { create } from "zustand";

const storedToken = localStorage.getItem("mes_lite_token");
const storedUser = localStorage.getItem("mes_lite_user");

function parseStoredUser(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    localStorage.removeItem("mes_lite_token");
    localStorage.removeItem("mes_lite_user");
    return null;
  }
}

const initialUser = parseStoredUser(storedUser);
const initialToken = initialUser ? storedToken : null;

export const useAuthStore = create((set) => ({
  token: initialToken,
  user: initialUser,
  setSession: ({ token, user }) => {
    localStorage.setItem("mes_lite_token", token);
    localStorage.setItem("mes_lite_user", JSON.stringify(user));
    set({ token, user });
  },
  clearSession: () => {
    localStorage.removeItem("mes_lite_token");
    localStorage.removeItem("mes_lite_user");
    set({ token: null, user: null });
  }
}));
