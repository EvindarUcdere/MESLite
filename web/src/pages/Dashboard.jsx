export default function Dashboard() {
  return (
    <main className="dashboard-page">
      <header>
        <div>
          <h1>MES Lite Dashboard</h1>
          <p>Live production overview</p>
        </div>
      </header>
      <section className="summary-grid">
        <article>
          <span>Active Orders</span>
          <strong>0</strong>
        </article>
        <article>
          <span>Produced</span>
          <strong>0</strong>
        </article>
        <article>
          <span>Scrap Rate</span>
          <strong>0%</strong>
        </article>
        <article>
          <span>Running Machines</span>
          <strong>0</strong>
        </article>
      </section>
    </main>
  );
}
