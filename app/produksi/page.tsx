import { connection } from "next/server";
import { ProductionPage } from "@/components/produksi/production-page";
import { DEFAULT_PRODUCTION_DATE } from "@/lib/production-date";

export const metadata = { title: "Produksi | MilkGraph" };

export default async function Page() {
  await connection();
  return <ProductionPage initialDate={DEFAULT_PRODUCTION_DATE} />;
}
