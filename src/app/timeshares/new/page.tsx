import Link from "next/link";
import TimeshareForm from "@/components/TimeshareForm";
import { createTimeshare } from "../actions";

export default function NewTimesharePage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Add timeshare</h1>
          <p>
            <Link href="/timeshares" className="muted">
              ← Back to timeshares
            </Link>
          </p>
        </div>
      </div>
      <div className="panel">
        <TimeshareForm action={createTimeshare} />
      </div>
    </div>
  );
}
