import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api/auth.api.js";
import { useAuthStore } from "../store/authStore.js";

function getLoginErrorMessage(error) {
  if (error?.message === "Network Error" || error?.code === "ERR_NETWORK") {
    return "Backend bağlantısı kurulamadı. API server açık mı kontrol edin.";
  }

  return "E-posta veya şifre hatalı.";
}

export default function Login() {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [email, setEmail] = useState("admin@meslite.local");
  const [password, setPassword] = useState("Admin123!");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const session = await login({ email, password });
      setSession(session);
      navigate("/");
    } catch (loginError) {
      setError(getLoginErrorMessage(loginError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>MES Lite</h1>
        <p>Fabrika üretim takip sistemi</p>
        <form onSubmit={handleSubmit}>
          <label>
            E-posta
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="admin@meslite.local" />
          </label>
          <label>
            Şifre
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Admin123!" />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>
      </section>
    </main>
  );
}
