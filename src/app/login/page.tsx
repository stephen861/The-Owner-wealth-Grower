import { login } from "./actions";

export const metadata = { title: "FGW staff login" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <div style={{ maxWidth: 360, margin: "80px auto", padding: "0 16px" }}>
      <h1 style={{ marginBottom: 4 }}>FGW staff login</h1>
      <p className="muted" style={{ marginTop: 0 }}>Leasing inbox and CRM. Staff only.</p>
      {error === "1" && <div className="badge red" style={{ marginBottom: 12 }}>Wrong password. Try again.</div>}
      {error === "config" && <div className="badge red" style={{ marginBottom: 12 }}>Staff login isn&apos;t set up on this server yet.</div>}
      <form action={login} className="card">
        <input type="hidden" name="next" value={next ?? "/leasing"} />
        <div className="field">
          <label htmlFor="password">Staff password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
        </div>
        <button className="btn" type="submit">Log in</button>
      </form>
    </div>
  );
}
