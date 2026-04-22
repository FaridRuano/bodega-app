import { redirect } from "next/navigation";

export default function LoungePage() {
  redirect("/dashboard/inventory?scope=lounge");
}
