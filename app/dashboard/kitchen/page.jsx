import { redirect } from "next/navigation";

export default function KitchenPage() {
  redirect("/dashboard/inventory?scope=kitchen");
}
