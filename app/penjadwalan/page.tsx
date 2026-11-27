import { connection } from "next/server";
import { Penjadwalan } from "@/components/penjadwalan/penjadwalan";
import { validProductionDate } from "@/lib/factory-monitor";
import { dateInWib } from "@/lib/production-date";

export const metadata = { title: "Penjadwalan | MilkGraph" };

export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await connection();
  const params = await searchParams;
  const date = validProductionDate(params.date) ? params.date : dateInWib();
  return <Penjadwalan key={date} initialDate={date} />;
}
