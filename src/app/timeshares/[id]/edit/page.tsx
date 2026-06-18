import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import TimeshareForm from "@/components/TimeshareForm";
import { updateTimeshare } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditTimesharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await prisma.timeshare.findUnique({ where: { id } });
  if (!t) notFound();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Edit {t.name}</h1>
          <p>
            <Link href={`/timeshares/${t.id}`} className="muted">
              ← Back to timeshare
            </Link>
          </p>
        </div>
      </div>
      <div className="panel">
        <TimeshareForm action={updateTimeshare} initial={t} submitLabel="Save changes" />
      </div>
    </div>
  );
}
