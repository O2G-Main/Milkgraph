import { connection } from "next/server";
import { FactoryMonitor } from "@/components/kondisi-pabrik/factory-monitor";
import { dateInWib } from "@/lib/production-date";
import { validProductionDate } from "@/lib/factory-monitor";

export const metadata = { title: "Kondisi Pabrik | MilkGraph" };
export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string; batch?: string }> }) {
  await connection();
  const params = await searchParams;
  const date = validProductionDate(params.date) ? params.date : dateInWib();
  const batch = typeof params.batch === "string" ? params.batch : "";
  return <FactoryMonitor key={`${date}:${batch}`} initialDate={date} initialBatch={batch} invalidDate={params.date !== undefined && !validProductionDate(params.date)} />;
}
