import { create } from "zustand";

const storedToken = localStorage.getItem("mes_lite_token");
const storedUser = localStorage.getItem("mes_lite_user");

export const useAuthStore = create((set) => ({
  token: storedToken,
  user: storedUser ? JSON.parse(storedUser) : null,
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
