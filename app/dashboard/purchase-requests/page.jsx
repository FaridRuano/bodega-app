import { redirect } from "next/navigation";

export default function PurchaseRequestsRedirectPage() {
  redirect("/dashboard/purchases");
}
