import ChatWidget from "./ChatWidget";

export const metadata = { title: "FGW Leasing — Chat with us 24/7" };

export default function ChatPage() {
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ marginBottom: 4 }}>FGW Property Management</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Affordable homes · Ask about availability, income limits, tours, or how to apply — any time, day or night.
      </p>
      <ChatWidget />
      <p className="subnote" style={{ marginTop: 12 }}>
        🏠 Equal Housing Opportunity. This assistant provides general information and pre-screening only; final
        eligibility is determined after a complete application. Reasonable accommodation requests are always welcome —
        just ask and a team member will help.
      </p>
    </div>
  );
}
