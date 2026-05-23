export default function Login() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>MES Lite</h1>
        <p>Factory production tracking</p>
        <form>
          <label>
            Email
            <input type="email" placeholder="admin@meslite.local" />
          </label>
          <label>
            Password
            <input type="password" placeholder="Admin123!" />
          </label>
          <button type="submit">Sign in</button>
        </form>
      </section>
    </main>
  );
}
