import { Suspense } from "react";
import CcNav from "@/components/command-center/CcNav";
import { DEMO_DATASET_NAME } from "@/lib/command-center/demo-data";
import { resetDemoDatasetAction } from "@/lib/command-center/actions";

export const dynamic = "force-dynamic";

export default function CommandCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      {/* Unmissable, on every screen: this module is a synthetic prototype. */}
      <div className="cc-banner">
        <div>
          <strong>PROTOTYPE — SYNTHETIC DATA ONLY</strong>
          <div className="subnote">
            {DEMO_DATASET_NAME}. Every property, person, referral, amount and address
            below is invented. Nothing here reads, writes or syncs any live system,
            and this module does not replace Rent Manager or InSync.
          </div>
        </div>
        <form action={resetDemoDatasetAction}>
          <button className="btn ghost small" type="submit">
            Reset demo data
          </button>
        </form>
      </div>

      <Suspense fallback={<div className="subnote">Loading navigation…</div>}>
        <CcNav />
      </Suspense>

      {children}
    </div>
  );
}
